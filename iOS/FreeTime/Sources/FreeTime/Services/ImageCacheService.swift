import Foundation
import UIKit

/// Multi-layer image caching service with memory (NSCache) and disk caching
final class ImageCacheService {
    
    static let shared = ImageCacheService()
    
    // MARK: - Memory Cache (NSCache - auto-evicts on memory pressure)
    private let memoryCache = NSCache<NSString, UIImage>()
    
    // MARK: - Disk Cache Configuration
    private let fileManager = FileManager.default
    private let cacheDirectory: URL
    private let maxDiskCacheAge: TimeInterval = 7 * 24 * 60 * 60 // 7 days
    private let maxDiskCacheSize: Int = 200 * 1024 * 1024 // 200 MB
    
    // MARK: - Init
    
    private init() {
        // Memory cache limits
        memoryCache.countLimit = 100 // Max 100 images in memory
        memoryCache.totalCostLimit = 50 * 1024 * 1024 // 50 MB rough limit
        
        // Set up disk cache directory
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("ImageCache", isDirectory: true)
        
        // Create directory if needed
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        
        // Listen for memory warnings
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(clearMemoryCache),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        
        // Clean old disk cache on launch (background)
        Task.detached(priority: .background) { [weak self] in
            self?.cleanExpiredDiskCache()
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    // MARK: - Public API
    
    /// Get an image from cache (memory first, then disk)
    func image(for key: String) -> UIImage? {
        let cacheKey = sanitizedKey(key)
        
        // 1. Check memory cache
        if let cached = memoryCache.object(forKey: cacheKey as NSString) {
            return cached
        }
        
        // 2. Check disk cache
        if let diskImage = loadFromDisk(key: cacheKey) {
            // Promote to memory cache
            let cost = diskImage.jpegData(compressionQuality: 1.0)?.count ?? 0
            memoryCache.setObject(diskImage, forKey: cacheKey as NSString, cost: cost)
            return diskImage
        }
        
        return nil
    }
    
    /// Store an image in both memory and disk cache
    func setImage(_ image: UIImage, for key: String) {
        let cacheKey = sanitizedKey(key)
        
        // Store in memory
        let cost = image.jpegData(compressionQuality: 1.0)?.count ?? 0
        memoryCache.setObject(image, forKey: cacheKey as NSString, cost: cost)
        
        // Store on disk (async to avoid blocking)
        Task.detached(priority: .background) { [weak self] in
            self?.saveToDisk(image: image, key: cacheKey)
        }
    }
    
    /// Check if image exists in cache without loading it
    func hasImage(for key: String) -> Bool {
        let cacheKey = sanitizedKey(key)
        
        // Check memory
        if memoryCache.object(forKey: cacheKey as NSString) != nil {
            return true
        }
        
        // Check disk
        let fileURL = cacheDirectory.appendingPathComponent(cacheKey)
        return fileManager.fileExists(atPath: fileURL.path)
    }
    
    /// Remove a specific image from cache
    func removeImage(for key: String) {
        let cacheKey = sanitizedKey(key)
        memoryCache.removeObject(forKey: cacheKey as NSString)
        
        let fileURL = cacheDirectory.appendingPathComponent(cacheKey)
        try? fileManager.removeItem(at: fileURL)
    }
    
    /// Clear all caches
    func clearAll() {
        clearMemoryCache()
        clearDiskCache()
    }
    
    // MARK: - Memory Cache
    
    @objc private func clearMemoryCache() {
        print("[ImageCache] Clearing memory cache")
        memoryCache.removeAllObjects()
    }
    
    // MARK: - Disk Cache
    
    private func saveToDisk(image: UIImage, key: String) {
        let fileURL = cacheDirectory.appendingPathComponent(key)
        
        // Prefer JPEG for photos (smaller), PNG for graphics with transparency
        guard let data = image.jpegData(compressionQuality: 0.85) else { return }
        
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("[ImageCache] Failed to save to disk: \(error.localizedDescription)")
        }
    }
    
    private func loadFromDisk(key: String) -> UIImage? {
        let fileURL = cacheDirectory.appendingPathComponent(key)
        
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
        
        // Check if expired
        if let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path),
           let modDate = attributes[.modificationDate] as? Date {
            if Date().timeIntervalSince(modDate) > maxDiskCacheAge {
                try? fileManager.removeItem(at: fileURL)
                return nil
            }
        }
        
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return UIImage(data: data)
    }
    
    private func clearDiskCache() {
        print("[ImageCache] Clearing disk cache")
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
    
    private func cleanExpiredDiskCache() {
        guard let enumerator = fileManager.enumerator(
            at: cacheDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else { return }
        
        var totalSize: Int = 0
        var filesToDelete: [URL] = []
        var cachedFiles: [(url: URL, date: Date, size: Int)] = []
        let expirationDate = Date().addingTimeInterval(-maxDiskCacheAge)
        
        while let fileURL = enumerator.nextObject() as? URL {
            guard let resourceValues = try? fileURL.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let modDate = resourceValues.contentModificationDate,
                  let fileSize = resourceValues.fileSize else { continue }
            
            // Mark expired files for deletion
            if modDate < expirationDate {
                filesToDelete.append(fileURL)
            } else {
                totalSize += fileSize
                cachedFiles.append((fileURL, modDate, fileSize))
            }
        }
        
        // Delete expired files
        for fileURL in filesToDelete {
            try? fileManager.removeItem(at: fileURL)
        }
        
        // If still over size limit, delete oldest files
        if totalSize > maxDiskCacheSize {
            // Sort by date (oldest first)
            cachedFiles.sort { $0.date < $1.date }
            
            for file in cachedFiles {
                if totalSize <= maxDiskCacheSize { break }
                try? fileManager.removeItem(at: file.url)
                totalSize -= file.size
            }
        }
        
        print("[ImageCache] Disk cache cleaned. Current size: \(totalSize / 1024 / 1024) MB")
    }
    
    // MARK: - Helpers
    
    private func sanitizedKey(_ key: String) -> String {
        // Remove URL components, keep just the storage ID or a safe filename
        let sanitized = key
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: ":", with: "_")
            .replacingOccurrences(of: "?", with: "_")
            .replacingOccurrences(of: "&", with: "_")
            .replacingOccurrences(of: "=", with: "_")
        
        // Limit length
        if sanitized.count > 100 {
            return String(sanitized.suffix(100))
        }
        return sanitized
    }
}

