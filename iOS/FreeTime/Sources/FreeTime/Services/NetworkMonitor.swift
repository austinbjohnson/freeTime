import Foundation
import Network

@MainActor
final class NetworkMonitor: ObservableObject {
    enum ConnectionType: String {
        case wifi
        case cellular
        case ethernet
        case unknown
    }
    
    @Published private(set) var isConnected = true
    @Published private(set) var isExpensive = false
    @Published private(set) var connectionType: ConnectionType = .unknown
    
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "com.freetime.networkmonitor")
    
    init() {
        monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            let expensive = path.isExpensive
            let type: ConnectionType
            if path.usesInterfaceType(.wifi) {
                type = .wifi
            } else if path.usesInterfaceType(.cellular) {
                type = .cellular
            } else if path.usesInterfaceType(.wiredEthernet) {
                type = .ethernet
            } else {
                type = .unknown
            }
            
            DispatchQueue.main.async {
                self?.isConnected = connected
                self?.isExpensive = expensive
                self?.connectionType = type
            }
        }
        monitor.start(queue: queue)
    }
    
    deinit {
        monitor.cancel()
    }
}
