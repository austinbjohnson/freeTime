import Foundation

final class AppNavigationState: ObservableObject {
    static let requestedTabDefaultsKey = "appintent.requestedTab"

    enum Tab: Int {
        case camera = 0
        case scans = 1
        case profile = 2
    }
    
    @Published var selectedTab: Tab = .camera
    @Published var requestedScanId: String?

    @MainActor
    func applyPendingTabRequest() {
        let defaults = UserDefaults.standard
        let key = Self.requestedTabDefaultsKey
        guard defaults.object(forKey: key) != nil else { return }
        let rawValue = defaults.integer(forKey: key)
        defaults.removeObject(forKey: key)
        if let tab = Tab(rawValue: rawValue) {
            selectedTab = tab
        }
    }
}
