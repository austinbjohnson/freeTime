import Foundation
import AuthenticationServices
import UIKit

/// Service for handling WorkOS authentication
@MainActor
class AuthService: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    
    // MARK: - Configuration
    
    private let clientId: String
    private let redirectUri: String
    
    // MARK: - Published State
    
    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var workosUser: WorkOSUser?
    @Published var error: AuthError?
    
    // MARK: - Storage
    
    private let tokenKey = "com.tagscanner.auth.token"
    private let userKey = "com.tagscanner.auth.user"
    
    // MARK: - Initialization
    
    override init() {
        // Load from Info.plist or environment
        self.clientId = Bundle.main.infoDictionary?["WORKOS_CLIENT_ID"] as? String ?? ""
        self.redirectUri = Bundle.main.infoDictionary?["WORKOS_REDIRECT_URI"] as? String ?? "tagscanner://callback"
        
        super.init()
        
        // Check for existing session
        loadStoredSession()
    }
    
    // MARK: - ASWebAuthenticationPresentationContextProviding
    
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Return the key window for presentation
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
    
    // MARK: - Authentication Flow
    
    /// Start the login flow
    func login() async {
        isLoading = true
        error = nil
        
        // Build WorkOS authorization URL
        var components = URLComponents(string: "https://api.workos.com/sso/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "provider", value: "authkit"),
        ]
        
        guard let authURL = components.url else {
            error = .invalidConfiguration
            isLoading = false
            return
        }
        
        // Use ASWebAuthenticationSession for OAuth
        do {
            let callbackURL = try await authenticate(with: authURL)
            try await handleCallback(url: callbackURL)
        } catch {
            self.error = .authenticationFailed(error.localizedDescription)
            isLoading = false
        }
    }
    
    /// Handle OAuth callback
    private func handleCallback(url: URL) async throws {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw AuthError.invalidCallback
        }
        
        // Exchange code for token
        let tokenResponse = try await exchangeCodeForToken(code: code)
        
        // Store the token
        storeToken(tokenResponse.accessToken)
        
        // Fetch user info
        let user = try await fetchUserInfo(accessToken: tokenResponse.accessToken)
        self.workosUser = user
        storeUser(user)
        
        isAuthenticated = true
        isLoading = false
    }
    
    /// Sign out
    func logout() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: userKey)
        workosUser = nil
        isAuthenticated = false
    }
    
    // MARK: - Private Methods
    
    private func authenticate(with url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { [weak self] continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "tagscanner"
            ) { callbackURL, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let url = callbackURL {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: AuthError.cancelled)
                }
            }
            
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }
    }
    
    private func exchangeCodeForToken(code: String) async throws -> TokenResponse {
        var request = URLRequest(url: URL(string: "https://api.workos.com/sso/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "grant_type=authorization_code",
            "client_id=\(clientId)",
            "code=\(code)",
            "redirect_uri=\(redirectUri)"
        ].joined(separator: "&")
        
        request.httpBody = body.data(using: .utf8)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.tokenExchangeFailed
        }
        
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }
    
    private func fetchUserInfo(accessToken: String) async throws -> WorkOSUser {
        var request = URLRequest(url: URL(string: "https://api.workos.com/sso/profile")!)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw AuthError.userInfoFailed
        }
        
        let profileResponse = try JSONDecoder().decode(ProfileResponse.self, from: data)
        return profileResponse.profile
    }
    
    private func loadStoredSession() {
        guard let token = UserDefaults.standard.string(forKey: tokenKey),
              !token.isEmpty else {
            return
        }
        
        if let userData = UserDefaults.standard.data(forKey: userKey),
           let user = try? JSONDecoder().decode(WorkOSUser.self, from: userData) {
            self.workosUser = user
            self.isAuthenticated = true
        }
    }
    
    private func storeToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: tokenKey)
    }
    
    private func storeUser(_ user: WorkOSUser) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userKey)
        }
    }
}

// MARK: - Models

struct WorkOSUser: Codable {
    let id: String
    let email: String
    let firstName: String?
    let lastName: String?
    let profilePictureUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case email
        case firstName = "first_name"
        case lastName = "last_name"
        case profilePictureUrl = "profile_picture_url"
    }
}

private struct TokenResponse: Codable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int?
    
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
    }
}

private struct ProfileResponse: Codable {
    let profile: WorkOSUser
}

// MARK: - Errors

enum AuthError: LocalizedError {
    case invalidConfiguration
    case cancelled
    case invalidCallback
    case tokenExchangeFailed
    case userInfoFailed
    case authenticationFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidConfiguration:
            return "Authentication is not properly configured"
        case .cancelled:
            return "Authentication was cancelled"
        case .invalidCallback:
            return "Invalid authentication callback"
        case .tokenExchangeFailed:
            return "Failed to complete authentication"
        case .userInfoFailed:
            return "Failed to retrieve user information"
        case .authenticationFailed(let message):
            return message
        }
    }
}

