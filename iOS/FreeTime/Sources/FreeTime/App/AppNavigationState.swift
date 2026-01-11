import Foundation

final class AppNavigationState: ObservableObject {
    enum Tab: Int {
        case camera = 0
        case scans = 1
        case profile = 2
    }
    
    @Published var selectedTab: Tab = .camera
    @Published var requestedScanId: String?
}
