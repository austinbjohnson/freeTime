import Foundation
import Vision
import UIKit

/// Service for on-device text extraction using Apple Vision
class VisionService {
    
    /// Check if running in Simulator where Vision ML often fails
    private var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }
    
    // MARK: - Text Recognition
    
    /// Extract text from an image using Vision framework
    /// Returns an array of recognized text strings
    func extractText(from image: UIImage) async throws -> [String] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            // Thread-safe flag to prevent double-resume
            let hasResumed = UnsafeMutablePointer<Bool>.allocate(capacity: 1)
            hasResumed.initialize(to: false)
            
            let request = VNRecognizeTextRequest { request, error in
                guard !hasResumed.pointee else { return }
                hasResumed.pointee = true
                
                if let error = error {
                    continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
                    hasResumed.deallocate()
                    return
                }
                
                guard let observations = request.results as? [VNRecognizedTextObservation] else {
                    continuation.resume(returning: [])
                    hasResumed.deallocate()
                    return
                }
                
                let texts = observations.compactMap { observation in
                    observation.topCandidates(1).first?.string
                }
                
                continuation.resume(returning: texts)
                hasResumed.deallocate()
            }
            
            // Configure for best accuracy
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US"]
            
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            
            do {
                try handler.perform([request])
            } catch {
                guard !hasResumed.pointee else {
                    hasResumed.deallocate()
                    return
                }
                hasResumed.pointee = true
                continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
                hasResumed.deallocate()
            }
        }
    }
    
    /// Extract text with bounding boxes for debugging/display
    func extractTextWithPositions(from image: UIImage) async throws -> [TextObservation] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            // Thread-safe flag to prevent double-resume
            let hasResumed = UnsafeMutablePointer<Bool>.allocate(capacity: 1)
            hasResumed.initialize(to: false)
            
            let request = VNRecognizeTextRequest { request, error in
                guard !hasResumed.pointee else { return }
                hasResumed.pointee = true
                
                if let error = error {
                    continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
                    hasResumed.deallocate()
                    return
                }
                
                guard let observations = request.results as? [VNRecognizedTextObservation] else {
                    continuation.resume(returning: [])
                    hasResumed.deallocate()
                    return
                }
                
                let results = observations.compactMap { observation -> TextObservation? in
                    guard let candidate = observation.topCandidates(1).first else { return nil }
                    return TextObservation(
                        text: candidate.string,
                        confidence: candidate.confidence,
                        boundingBox: observation.boundingBox
                    )
                }
                
                continuation.resume(returning: results)
                hasResumed.deallocate()
            }
            
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            
            do {
                try handler.perform([request])
            } catch {
                guard !hasResumed.pointee else {
                    hasResumed.deallocate()
                    return
                }
                hasResumed.pointee = true
                continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
                hasResumed.deallocate()
            }
        }
    }
    
    // MARK: - Barcode Detection
    
    /// Detect barcodes in an image
    /// Note: Barcode detection can fail in Simulator - returns empty array on failure
    func detectBarcodes(from image: UIImage) async throws -> [BarcodeObservation] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            // Thread-safe flag to prevent double-resume (Vision can call handler multiple times)
            let hasResumed = UnsafeMutablePointer<Bool>.allocate(capacity: 1)
            hasResumed.initialize(to: false)
            
            let request = VNDetectBarcodesRequest { request, error in
                // Ensure we only resume once
                guard !hasResumed.pointee else { return }
                hasResumed.pointee = true
                
                if let error = error {
                    // In Simulator, barcode detection often fails - return empty instead of throwing
                    print("[Vision] Barcode detection error (non-fatal): \(error.localizedDescription)")
                    continuation.resume(returning: [])
                    hasResumed.deallocate()
                    return
                }
                
                guard let observations = request.results as? [VNBarcodeObservation] else {
                    continuation.resume(returning: [])
                    hasResumed.deallocate()
                    return
                }
                
                let barcodes = observations.compactMap { observation -> BarcodeObservation? in
                    guard let payload = observation.payloadStringValue else { return nil }
                    return BarcodeObservation(
                        payload: payload,
                        symbology: observation.symbology.rawValue,
                        boundingBox: observation.boundingBox
                    )
                }
                
                continuation.resume(returning: barcodes)
                hasResumed.deallocate()
            }
            
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            
            do {
                try handler.perform([request])
            } catch {
                // Only resume if completion handler hasn't already
                guard !hasResumed.pointee else {
                    hasResumed.deallocate()
                    return
                }
                hasResumed.pointee = true
                // Return empty array instead of crashing - barcode detection is optional
                print("[Vision] Barcode detection perform error (non-fatal): \(error.localizedDescription)")
                continuation.resume(returning: [])
                hasResumed.deallocate()
            }
        }
    }
    
    // MARK: - Combined Analysis
    
    /// Perform full tag analysis: text + barcode
    /// In Simulator, Vision ML often fails/hangs - returns empty results instead
    func analyzeTag(image: UIImage) async -> TagAnalysis {
        // Skip Vision entirely in Simulator - it's unreliable and causes crashes
        if isSimulator {
            print("[Vision] Skipping on-device analysis in Simulator (AI will analyze instead)")
            return TagAnalysis(rawText: [], barcodes: [])
        }
        
        // On real device, run Vision analysis with timeout protection
        async let textTask = safeExtractText(from: image)
        async let barcodeTask = safeDetectBarcodes(from: image)
        
        let (texts, barcodes) = await (textTask, barcodeTask)
        
        return TagAnalysis(
            rawText: texts,
            barcodes: barcodes
        )
    }
    
    /// Safe wrapper for text extraction - never throws, returns empty on failure
    private func safeExtractText(from image: UIImage) async -> [String] {
        do {
            return try await extractText(from: image)
        } catch {
            print("[Vision] Text extraction failed: \(error.localizedDescription)")
            return []
        }
    }
    
    /// Safe wrapper for barcode detection - never throws, returns empty on failure
    private func safeDetectBarcodes(from image: UIImage) async -> [BarcodeObservation] {
        do {
            return try await detectBarcodes(from: image)
        } catch {
            print("[Vision] Barcode detection failed: \(error.localizedDescription)")
            return []
        }
    }
}

// MARK: - Models

struct TextObservation {
    let text: String
    let confidence: Float
    let boundingBox: CGRect
}

struct BarcodeObservation {
    let payload: String
    let symbology: String
    let boundingBox: CGRect
}

struct TagAnalysis {
    let rawText: [String]
    let barcodes: [BarcodeObservation]
    
    /// All text hints to send to AI (combines OCR text and barcode values)
    var allHints: [String] {
        rawText + barcodes.map { $0.payload }
    }
}

// MARK: - Errors

enum VisionError: LocalizedError {
    case invalidImage
    case recognitionFailed(String)
    case barcodeDetectionFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidImage:
            return "The image could not be processed"
        case .recognitionFailed(let message):
            return "Text recognition failed: \(message)"
        case .barcodeDetectionFailed(let message):
            return "Barcode detection failed: \(message)"
        }
    }
}

