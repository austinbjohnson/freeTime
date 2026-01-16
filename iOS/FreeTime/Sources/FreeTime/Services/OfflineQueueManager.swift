import Foundation
import Combine
import UIKit

@MainActor
final class OfflineQueueManager: ObservableObject {
    @Published private(set) var pendingCount = 0
    @Published private(set) var isProcessing = false
    
    private let store = OfflineSubmissionStore.shared
    private var pending: [PendingSubmission] = []
    private var isConnected = true
    private var networkCancellable: AnyCancellable?
    private weak var convexService: ConvexService?
    
    func attach(convexService: ConvexService, networkMonitor: NetworkMonitor) {
        self.convexService = convexService
        pending = store.loadQueue()
        pendingCount = pending.count
        isConnected = networkMonitor.isConnected
        
        networkCancellable = networkMonitor.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                guard let self else { return }
                self.isConnected = connected
                if connected {
                    self.processQueueIfNeeded()
                }
            }
        
        if isConnected {
            processQueueIfNeeded()
        }
    }
    
    func enqueue(images: [UIImage], hints: [String]) -> Bool {
        guard let submission = store.enqueue(images: images, hints: hints) else { return false }
        pending.append(submission)
        pendingCount = pending.count
        if isConnected {
            processQueueIfNeeded()
        }
        return true
    }
    
    private func processQueueIfNeeded() {
        guard isConnected, !isProcessing, let submission = pending.first else { return }
        isProcessing = true
        Task {
            await process(submission)
        }
    }
    
    private func process(_ submission: PendingSubmission) async {
        var didSucceed = false
        defer {
            isProcessing = false
            if didSucceed {
                processQueueIfNeeded()
            }
        }
        
        guard let convexService else { return }
        
        let imageDatas = submission.imagePaths.compactMap { store.loadImageData(path: $0) }
        guard !imageDatas.isEmpty else {
            remove(submission)
            didSucceed = true
            return
        }
        
        do {
            var storageIds: [String] = []
            for data in imageDatas {
                let storageId = try await convexService.uploadImage(data: data, mimeType: "image/jpeg")
                storageIds.append(storageId)
            }
            
            let scanId = try await convexService.createScan(imageStorageId: storageIds[0])
            var scanImageIds: [String] = []
            for storageId in storageIds {
                do {
                    let scanImageId = try await convexService.addScanImage(
                        scanId: scanId,
                        imageStorageId: storageId
                    )
                    scanImageIds.append(scanImageId)
                } catch {
                    print("[OfflineQueue] Failed to attach scan image: \(error)")
                }
            }
            try await convexService.processMultiImageScan(
                scanId: scanId,
                imageStorageIds: storageIds,
                scanImageIds: scanImageIds.count == storageIds.count ? scanImageIds : nil,
                onDeviceHints: submission.hints.isEmpty ? nil : submission.hints
            )
            
            remove(submission)
            didSucceed = true
        } catch {
            print("[OfflineQueue] Failed to process queued submission \(submission.id): \(error)")
        }
    }
    
    private func remove(_ submission: PendingSubmission) {
        store.remove(submission)
        pending.removeAll { $0.id == submission.id }
        pendingCount = pending.count
    }
}
