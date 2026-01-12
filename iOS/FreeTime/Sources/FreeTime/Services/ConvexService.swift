import Foundation
import Combine

/// Service for communicating with Convex backend via HTTP
@MainActor
class ConvexService: ObservableObject {
    
    // MARK: - Configuration
    
    private let baseURL: URL
    private let session: URLSession
    private var realtimeClient: ConvexRealtimeClient?
    private var realtimeUserId: String?
    
    // MARK: - Published State
    
    @Published var currentUser: User?
    @Published var scans: [Scan] = []
    @Published var isLoading = false
    @Published var error: ConvexError?
    
    // MARK: - Initialization
    
    init(baseURL: URL? = nil) {
        // Load from environment or use default
        if let url = baseURL {
            self.baseURL = url
        } else if let urlString = Bundle.main.infoDictionary?["CONVEX_URL"] as? String,
                  let url = URL(string: urlString) {
            self.baseURL = url
        } else {
            // Default for development - should be configured
            self.baseURL = URL(string: "https://qualified-sheep-863.convex.cloud")!
        }
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120  // Pipeline can take 60-90 seconds
        config.timeoutIntervalForResource = 180
        self.session = URLSession(configuration: config)
    }
    
    // MARK: - User Management
    
    /// Sync user from WorkOS authentication
    func syncUser(workosId: String, email: String, firstName: String?, lastName: String?, avatarUrl: String?) async throws -> User {
        let result = try await mutation("users:getOrCreateUser", args: [
            "workosId": workosId,
            "email": email,
            "firstName": firstName as Any,
            "lastName": lastName as Any,
            "avatarUrl": avatarUrl as Any
        ])
        
        // The mutation returns a user ID, fetch the full user
        if let userId = result as? String {
            let user = try await query("users:getUser", args: ["userId": userId]) as? [String: Any]
            if let user = user {
                let userData = try JSONSerialization.data(withJSONObject: user)
                let decodedUser = try JSONDecoder().decode(User.self, from: userData)
                self.currentUser = decodedUser
                startRealtimeScans(userId: decodedUser.id)
                return decodedUser
            }
        }
        
        throw ConvexError.invalidResponse
    }
    
    // MARK: - Scan Operations
    
    /// Generate an upload URL for an image
    func generateUploadUrl() async throws -> URL {
        let result = try await mutation("scans:generateUploadUrl", args: [:])
        guard let urlString = result as? String, let url = URL(string: urlString) else {
            throw ConvexError.invalidResponse
        }
        return url
    }
    
    /// Upload an image to Convex storage
    func uploadImage(data: Data, mimeType: String) async throws -> String {
        let uploadUrl = try await generateUploadUrl()
        
        var request = URLRequest(url: uploadUrl)
        request.httpMethod = "POST"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        
        let (responseData, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw ConvexError.uploadFailed
        }
        
        let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any]
        guard let storageId = json?["storageId"] as? String else {
            throw ConvexError.invalidResponse
        }
        
        return storageId
    }
    
    /// Create a new scan record
    func createScan(imageStorageId: String, thumbnailStorageId: String? = nil) async throws -> String {
        guard let user = currentUser else {
            throw ConvexError.notAuthenticated
        }
        
        var args: [String: Any] = [
            "userId": user.id,
            "imageStorageId": imageStorageId
        ]
        
        if let thumbnailId = thumbnailStorageId {
            args["thumbnailStorageId"] = thumbnailId
        }
        
        let result = try await mutation("scans:createScan", args: args)
        guard let scanId = result as? String else {
            throw ConvexError.invalidResponse
        }
        
        return scanId
    }
    
    /// Start processing a scan through the pipeline (single image)
    func processScan(scanId: String, imageStorageId: String, onDeviceHints: [String]? = nil) async throws {
        var args: [String: Any] = [
            "scanId": scanId,
            "imageStorageId": imageStorageId
        ]
        
        if let hints = onDeviceHints {
            args["onDeviceHints"] = hints
        }
        
        // This is an action, not a mutation
        _ = try await action("pipeline/orchestrator:processScan", args: args)
    }
    
    /// Start processing a scan with multiple images
    func processMultiImageScan(scanId: String, imageStorageIds: [String], onDeviceHints: [String]? = nil) async throws {
        var args: [String: Any] = [
            "scanId": scanId,
            "imageStorageIds": imageStorageIds
        ]
        
        if let hints = onDeviceHints {
            args["onDeviceHints"] = hints
        }
        
        // Uses the multi-image pipeline action
        _ = try await action("pipeline/orchestrator:processMultiImageScan", args: args)
    }
    
    /// Fetch all scans for the current user
    func fetchUserScans() async throws {
        guard let user = currentUser else {
            throw ConvexError.notAuthenticated
        }
        
        isLoading = true
        defer { isLoading = false }
        
        let result = try await query("scans:getUserScans", args: ["userId": user.id])
        
        if let scansArray = result as? [[String: Any]] {
            let data = try JSONSerialization.data(withJSONObject: scansArray)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .millisecondsSince1970
            self.scans = try decoder.decode([Scan].self, from: data)
        }
    }

    // MARK: - Real-time Subscriptions

    func setRealtimeActive(_ isActive: Bool) {
        if isActive {
            guard let userId = currentUser?.id else { return }
            startRealtimeScans(userId: userId)
        } else {
            stopRealtimeScans()
        }
    }

    private func startRealtimeScans(userId: String) {
        if realtimeUserId == userId {
            return
        }
        stopRealtimeScans()
        realtimeUserId = userId
        let client = ConvexRealtimeClient(baseURL: baseURL)
        client.subscribe(
            path: "scans:getUserScans",
            args: ["userId": userId],
            onUpdate: { [weak self] value in
                guard let self else { return }
                Task { @MainActor in
                    self.applyScanUpdates(value)
                }
            },
            onError: { [weak self] message in
                guard let self else { return }
                Task { @MainActor in
                    self.error = .serverError(message)
                }
            }
        )
        realtimeClient = client
        client.connect()
    }

    private func stopRealtimeScans() {
        realtimeClient?.disconnect()
        realtimeClient = nil
        realtimeUserId = nil
    }

    private func applyScanUpdates(_ value: Any?) {
        guard let scansArray = value as? [[String: Any]] else {
            scans = []
            return
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: scansArray)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .millisecondsSince1970
            scans = try decoder.decode([Scan].self, from: data)
        } catch {
            self.error = .invalidResponse
        }
    }
    
    /// Fetch a single scan by ID
    func fetchScan(scanId: String) async throws -> Scan? {
        let result = try await query("scans:getScan", args: ["scanId": scanId])
        
        guard let scanDict = result as? [String: Any] else {
            return nil
        }
        
        let data = try JSONSerialization.data(withJSONObject: scanDict)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return try decoder.decode(Scan.self, from: data)
    }
    
    /// Delete a scan
    func deleteScan(scanId: String) async throws {
        _ = try await mutation("scans:deleteScan", args: ["scanId": scanId])
        scans.removeAll { $0.id == scanId }
    }
    
    // MARK: - Clarification
    
    /// Apply a clarification answer to a scan awaiting clarification
    func applyClarification(scanId: String, field: String, value: String) async throws {
        let args: [String: Any] = [
            "scanId": scanId,
            "field": field,
            "value": value
        ]
        
        _ = try await mutation("scans:applyClarification", args: args)
    }
    
    /// Resume pipeline after clarification is applied
    func resumePipeline(scanId: String) async throws {
        let args: [String: Any] = [
            "scanId": scanId
        ]
        
        _ = try await action("pipeline/orchestrator:resumeAfterClarification", args: args)
    }
    
    // MARK: - Convex HTTP API
    
    private func query(_ functionName: String, args: [String: Any]) async throws -> Any? {
        return try await callFunction(type: "query", name: functionName, args: args)
    }
    
    private func mutation(_ functionName: String, args: [String: Any]) async throws -> Any? {
        return try await callFunction(type: "mutation", name: functionName, args: args)
    }
    
    private func action(_ functionName: String, args: [String: Any]) async throws -> Any? {
        return try await callFunction(type: "action", name: functionName, args: args)
    }
    
    private func callFunction(type: String, name: String, args: [String: Any]) async throws -> Any? {
        let endpoint = baseURL.appendingPathComponent("api/\(type)")
        
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "path": name,
            "args": args
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexError.networkError
        }
        
        if httpResponse.statusCode == 200 {
            let json = try JSONSerialization.jsonObject(with: data)
            if let result = json as? [String: Any] {
                return result["value"]
            }
            return json
        } else {
            // Try to parse error message
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = errorJson["message"] as? String {
                throw ConvexError.serverError(message)
            }
            throw ConvexError.serverError("HTTP \(httpResponse.statusCode)")
        }
    }
}

// MARK: - Errors

enum ConvexError: LocalizedError {
    case notAuthenticated
    case invalidResponse
    case uploadFailed
    case networkError
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to perform this action"
        case .invalidResponse:
            return "Received an invalid response from the server"
        case .uploadFailed:
            return "Failed to upload the image"
        case .networkError:
            return "A network error occurred"
        case .serverError(let message):
            return message
        }
    }
}
