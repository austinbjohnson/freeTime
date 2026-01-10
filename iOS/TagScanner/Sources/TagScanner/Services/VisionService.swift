import Foundation
import Vision
import UIKit

/// Service for on-device text extraction using Apple Vision
class VisionService {
    
    // MARK: - Text Recognition
    
    /// Extract text from an image using Vision framework
    /// Returns an array of recognized text strings
    func extractText(from image: UIImage) async throws -> [String] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error = error {
                    continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
                    return
                }
                
                guard let observations = request.results as? [VNRecognizedTextObservation] else {
                    continuation.resume(returning: [])
                    return
                }
                
                let texts = observations.compactMap { observation in
                    observation.topCandidates(1).first?.string
                }
                
                continuation.resume(returning: texts)
            }
            
            // Configure for best accuracy
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US"]
            
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
            }
        }
    }
    
    /// Extract text with bounding boxes for debugging/display
    func extractTextWithPositions(from image: UIImage) async throws -> [TextObservation] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error = error {
                    continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
                    return
                }
                
                guard let observations = request.results as? [VNRecognizedTextObservation] else {
                    continuation.resume(returning: [])
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
            }
            
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: VisionError.recognitionFailed(error.localizedDescription))
            }
        }
    }
    
    // MARK: - Barcode Detection
    
    /// Detect barcodes in an image
    func detectBarcodes(from image: UIImage) async throws -> [BarcodeObservation] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNDetectBarcodesRequest { request, error in
                if let error = error {
                    continuation.resume(throwing: VisionError.barcodeDetectionFailed(error.localizedDescription))
                    return
                }
                
                guard let observations = request.results as? [VNBarcodeObservation] else {
                    continuation.resume(returning: [])
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
            }
            
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: VisionError.barcodeDetectionFailed(error.localizedDescription))
            }
        }
    }
    
    // MARK: - Combined Analysis
    
    /// Perform full tag analysis: text + barcode
    func analyzeTag(image: UIImage) async throws -> TagAnalysis {
        async let textTask = extractText(from: image)
        async let barcodeTask = detectBarcodes(from: image)
        
        let (texts, barcodes) = try await (textTask, barcodeTask)
        
        return TagAnalysis(
            rawText: texts,
            barcodes: barcodes
        )
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

