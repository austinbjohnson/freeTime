import Foundation
import AuthenticationServices
import UIKit
import CryptoKit

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
    
    // MARK: - PKCE
    
    private var codeVerifier: String?
    
    // MARK: - Storage
    
    private let tokenKey = "com.freetime.auth.token"
    private let userKey = "com.freetime.auth.user"
    
    // MARK: - Initialization
    
    override init() {
        // Load from Info.plist or environment
        self.clientId = Bundle.main.infoDictionary?["WORKOS_CLIENT_ID"] as? String ?? ""
        self.redirectUri = Bundle.main.infoDictionary?["WORKOS_REDIRECT_URI"] as? String ?? "freetime://callback"
        
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
    
    // MARK: - PKCE Helpers
    
    private func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncodedString()
    }
    
    private func generateCodeChallenge(from verifier: String) -> String {
        let data = Data(verifier.utf8)
        let hash = SHA256.hash(data: data)
        return Data(hash).base64URLEncodedString()
    }
    
    // MARK: - Authentication Flow
    
    /// Start the login flow
    func login() async {
        isLoading = true
        error = nil
        
        // Generate PKCE code verifier and challenge
        let verifier = generateCodeVerifier()
        self.codeVerifier = verifier
        let challenge = generateCodeChallenge(from: verifier)
        
        // Build WorkOS User Management authorization URL
        var components = URLComponents(string: "https://api.workos.com/user_management/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "provider", value: "authkit"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        
        guard let authURL = components.url else {
            error = .invalidConfiguration
            isLoading = false
            return
        }
        
        print("[Auth] Starting OAuth flow with URL: \(authURL)")
        
        // Use ASWebAuthenticationSession for OAuth
        do {
            let callbackURL = try await authenticate(with: authURL)
            print("[Auth] Received callback: \(callbackURL)")
            try await handleCallback(url: callbackURL)
        } catch let authError as ASWebAuthenticationSessionError {
            if authError.code == .canceledLogin {
                self.error = .cancelled
            } else {
                self.error = .authenticationFailed(authError.localizedDescription)
            }
            isLoading = false
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
        
        print("[Auth] Exchanging code for token...")
        
        // Exchange code for token (with PKCE verifier)
        let tokenResponse = try await exchangeCodeForToken(code: code)
        
        // Store the token
        storeToken(tokenResponse.accessToken)
        
        // The user info is included in the token response for User Management API
        if let user = tokenResponse.user {
            self.workosUser = user
            storeUser(user)
        }
        
        isAuthenticated = true
        isLoading = false
        print("[Auth] Authentication successful!")
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
                callbackURLScheme: "freetime"
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
        guard let verifier = codeVerifier else {
            throw AuthError.invalidConfiguration
        }
        
        var request = URLRequest(url: URL(string: "https://api.workos.com/user_management/authenticate")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "grant_type": "authorization_code",
            "client_id": clientId,
            "code": code,
            "code_verifier": verifier
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.tokenExchangeFailed
        }
        
        if httpResponse.statusCode != 200 {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            print("[Auth] Token exchange failed: \(httpResponse.statusCode) - \(errorBody)")
            throw AuthError.tokenExchangeFailed
        }
        
        return try JSONDecoder().decode(TokenResponse.self, from: data)
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
    let refreshToken: String?
    let user: WorkOSUser?
    
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case user
    }
}

// MARK: - Data Extension for PKCE

extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
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

