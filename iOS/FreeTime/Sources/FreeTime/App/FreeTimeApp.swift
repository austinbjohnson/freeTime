import SwiftUI

@main
struct FreeTimeApp: App {
    @StateObject private var authService = AuthService()
    @StateObject private var convexService = ConvexService()
    @StateObject private var navigationState = AppNavigationState()
    
    init() {
        // Configure URLCache for system-level HTTP caching
        let cache = URLCache(
            memoryCapacity: 50_000_000,  // 50 MB memory
            diskCapacity: 200_000_000,    // 200 MB disk
            directory: nil
        )
        URLCache.shared = cache
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(convexService)
                .environmentObject(navigationState)
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
