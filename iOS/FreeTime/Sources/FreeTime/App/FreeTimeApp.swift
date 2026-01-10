import SwiftUI

@main
struct FreeTimeApp: App {
    @StateObject private var authService = AuthService()
    @StateObject private var convexService = ConvexService()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(convexService)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    
    var body: some View {
        Group {
            if authService.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
    }
}

