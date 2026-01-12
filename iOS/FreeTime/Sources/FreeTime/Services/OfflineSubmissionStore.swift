import Foundation
import UIKit

struct PendingSubmission: Codable, Identifiable {
    let id: String
    let createdAt: Date
    let imagePaths: [String]
    let hints: [String]
}

final class OfflineSubmissionStore {
    static let shared = OfflineSubmissionStore()
    
    private let fileManager = FileManager.default
    private let queueDirectory: URL
    private let queueFile: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    
    private init() {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        queueDirectory = appSupport.appendingPathComponent("OfflineQueue", isDirectory: true)
        queueFile = queueDirectory.appendingPathComponent("queue.json")
        try? fileManager.createDirectory(at: queueDirectory, withIntermediateDirectories: true)
        
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
    }
    
    func loadQueue() -> [PendingSubmission] {
        guard let data = try? Data(contentsOf: queueFile) else { return [] }
        return (try? decoder.decode([PendingSubmission].self, from: data)) ?? []
    }
    
    func saveQueue(_ queue: [PendingSubmission]) {
        guard let data = try? encoder.encode(queue) else { return }
        try? data.write(to: queueFile, options: [.atomic])
    }
    
    func enqueue(images: [UIImage], hints: [String]) -> PendingSubmission? {
        let id = UUID().uuidString
        var imagePaths: [String] = []
        
        for (index, image) in images.enumerated() {
            let fileName = "\(id)-\(index).jpg"
            let fileURL = queueDirectory.appendingPathComponent(fileName)
            guard let data = image.jpegData(compressionQuality: 0.8) else { continue }
            do {
                try data.write(to: fileURL, options: [.atomic])
                imagePaths.append(fileName)
            } catch {
                continue
            }
        }
        
        guard !imagePaths.isEmpty else { return nil }
        
        let submission = PendingSubmission(
            id: id,
            createdAt: Date(),
            imagePaths: imagePaths,
            hints: hints
        )
        
        var queue = loadQueue()
        queue.append(submission)
        saveQueue(queue)
        return submission
    }
    
    func remove(_ submission: PendingSubmission) {
        for path in submission.imagePaths {
            let url = queueDirectory.appendingPathComponent(path)
            try? fileManager.removeItem(at: url)
        }
        var queue = loadQueue()
        queue.removeAll { $0.id == submission.id }
        saveQueue(queue)
    }
    
    func loadImageData(path: String) -> Data? {
        let url = queueDirectory.appendingPathComponent(path)
        return try? Data(contentsOf: url)
    }
}
