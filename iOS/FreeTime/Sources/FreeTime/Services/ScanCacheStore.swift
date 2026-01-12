import Foundation

final class ScanCacheStore {
    static let shared = ScanCacheStore()
    
    private let fileManager = FileManager.default
    private let cacheDirectory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    
    private init() {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        cacheDirectory = appSupport.appendingPathComponent("ScanCache", isDirectory: true)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
    }
    
    func loadScans(userId: String) -> [Scan] {
        let url = cacheURL(for: userId)
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? decoder.decode([Scan].self, from: data)) ?? []
    }
    
    func saveScans(_ scans: [Scan], userId: String) {
        let url = cacheURL(for: userId)
        guard let data = try? encoder.encode(scans) else { return }
        try? data.write(to: url, options: [.atomic])
    }
    
    func deleteCache(userId: String) {
        let url = cacheURL(for: userId)
        try? fileManager.removeItem(at: url)
    }
    
    private func cacheURL(for userId: String) -> URL {
        cacheDirectory.appendingPathComponent("scans-\(userId).json")
    }
}
