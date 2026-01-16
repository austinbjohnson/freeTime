import Foundation

/// Represents a clothing tag scan
struct Scan: Identifiable, Codable {
    let id: String
    let userId: String
    let imageStorageId: String
    var thumbnailStorageId: String?
    var status: ScanStatus
    var extractedData: ExtractedData?
    var researchResults: ResearchResults?
    var refinedFindings: RefinedFindings?
    var errorMessage: String?
    var imageUrl: String?
    var thumbnailUrl: String?
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case userId
        case imageStorageId
        case thumbnailStorageId
        case status
        case extractedData
        case researchResults
        case refinedFindings
        case errorMessage
        case imageUrl
        case thumbnailUrl
        case createdAt = "_creationTime"
    }
}

struct ScanImage: Identifiable, Codable {
    let id: String
    let scanId: String
    let imageStorageId: String
    let thumbnailStorageId: String?
    let imageType: String
    let processed: Bool
    let errorMessage: String?
    let imageUrl: String?
    let thumbnailUrl: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case scanId
        case imageStorageId
        case thumbnailStorageId
        case imageType
        case processed
        case errorMessage
        case imageUrl
        case thumbnailUrl
        case createdAt = "_creationTime"
    }
}

enum ScanStatus: String, Codable {
    case uploaded
    case extracting
    case awaitingClarification = "awaiting_clarification"
    case researching
    case refining
    case completed
    case failed
    
    var displayName: String {
        switch self {
        case .uploaded: return "Queued"
        case .extracting: return "Reading Tag..."
        case .awaitingClarification: return "Need Input"
        case .researching: return "Searching Web..."
        case .refining: return "Analyzing..."
        case .completed: return "Complete"
        case .failed: return "Failed"
        }
    }
    
    var isProcessing: Bool {
        switch self {
        case .extracting, .researching, .refining:
            return true
        default:
            return false
        }
    }
    
    var needsClarification: Bool {
        self == .awaitingClarification
    }
}

// MARK: - Clarification Types

struct ClarificationOption: Codable, Identifiable {
    var value: String
    var label: String
    
    var id: String { value }
}

struct ClarificationRequest: Codable {
    var field: String
    var question: String
    var options: [ClarificationOption]
    var reason: String
}

// MARK: - Pipeline Data Models

struct ExtractedData: Codable {
    var brand: String?
    var styleNumber: String?
    var sku: String?
    var size: String?
    var materials: [String]?
    var countryOfOrigin: String?
    var rnNumber: String?
    var wplNumber: String?
    var careInstructions: [String]?
    var rawText: [String]?
    var confidence: Double?
    var clarificationNeeded: ClarificationRequest?
}

struct ResearchResults: Codable {
    var listings: [Listing]
    var soldListings: [Listing]
    var originalRetailPrice: PriceInfo?
    var brandInfo: BrandInfo?
    var searchQueries: [String]
    var sources: [String]
    var marketRegion: String?
    var primaryCurrency: String?
    var currencyCounts: [String: Int]?
}

struct Listing: Codable, Identifiable {
    var id: String { url }
    var title: String
    var price: Double
    var currency: String
    var platform: String
    var url: String
    var condition: String?
    var soldDate: String?
    var imageUrl: String?
}

struct PriceInfo: Codable {
    var amount: Double
    var currency: String
    var source: String
}

struct BrandInfo: Codable {
    var name: String
    var description: String?
    var priceRange: String?
    var founded: String?
    var website: String?
}

struct RefinedFindings: Codable {
    var suggestedPriceRange: PriceRange
    var marketActivity: MarketActivity
    var demandLevel: DemandLevel
    var comparableListings: [ComparableListing]
    var insights: [String]
    var brandTier: BrandTier?
    var seasonalFactors: String?
    var confidence: Double
}

struct PriceRange: Codable {
    var low: Double
    var high: Double
    var recommended: Double
    var currency: String
    
    var formattedRange: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        
        let lowStr = formatter.string(from: NSNumber(value: low)) ?? "$\(low)"
        let highStr = formatter.string(from: NSNumber(value: high)) ?? "$\(high)"
        
        return "\(lowStr) - \(highStr)"
    }
    
    var formattedRecommended: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: NSNumber(value: recommended)) ?? "$\(recommended)"
    }
}

enum MarketActivity: String, Codable {
    case hot
    case moderate
    case slow
    case rare
    
    var emoji: String {
        switch self {
        case .hot: return "🔥"
        case .moderate: return "📊"
        case .slow: return "🐌"
        case .rare: return "💎"
        }
    }
}

enum DemandLevel: String, Codable {
    case high
    case medium
    case low
}

enum BrandTier: String, Codable {
    case luxury
    case premium
    case midRange = "mid-range"
    case budget
    case unknown
}

struct ComparableListing: Codable, Identifiable {
    var id: String { url }
    var title: String
    var price: Double
    var currency: String
    var platform: String
    var url: String
    var relevanceScore: Double
}
