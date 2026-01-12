import SwiftUI

@main
struct FreeTimeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var authService = AuthService()
    @StateObject private var convexService = ConvexService()
    @StateObject private var navigationState = AppNavigationState()
    @StateObject private var networkMonitor = NetworkMonitor()
    @StateObject private var offlineQueueManager = OfflineQueueManager()
    
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
                .environmentObject(networkMonitor)
                .environmentObject(offlineQueueManager)
                .onAppear {
                    convexService.attachNetworkMonitor(networkMonitor)
                    offlineQueueManager.attach(convexService: convexService, networkMonitor: networkMonitor)
                }
                .onChange(of: scenePhase) { newPhase in
                    Task { @MainActor in
                        switch newPhase {
                        case .active:
                            convexService.setRealtimeActive(true)
                        case .inactive, .background:
                            convexService.setRealtimeActive(false)
                        @unknown default:
                            break
                        }
                    }
                }
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
