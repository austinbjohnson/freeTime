/**
 * Pipeline Types - Shared types for the processing pipeline
 * Each stage has defined input/output schemas for swappability
 */

// ============================================
// Image Types and Classification
// ============================================
export type ImageType = "tag" | "garment" | "condition" | "detail" | "unknown";

// ============================================
// Stage 1: Data Extraction Output
// ============================================

// Traditional tag extraction (when tag image is available)
export interface TagExtraction {
  brand?: string;
  styleNumber?: string;
  sku?: string;
  size?: string;
  materials?: string[];
  countryOfOrigin?: string;
  rnNumber?: string; // US manufacturer registration
  wplNumber?: string; // Wool Products Label
  careInstructions?: string[];
  rawText: string[]; // All extracted text for reference
}

// Garment visual analysis (when analyzing the garment itself)
export interface GarmentAnalysis {
  category?: string; // sweater, jacket, pants, dress, etc.
  style?: string; // Cowichan, varsity, bomber, etc.
  estimatedEra?: string; // vintage, 80s, modern, etc.
  colors: string[];
  patterns?: string[]; // geometric, floral, striped, etc.
  construction?: string; // hand-knit, machine-made, etc.
  estimatedBrand?: string; // Best guess if no tag
  estimatedOrigin?: string; // Geographic/cultural origin
  notableFeatures?: string[]; // Unique identifying features
}

// Condition assessment (when analyzing wear/tear)
export interface ConditionAssessment {
  overallGrade: "excellent" | "very good" | "good" | "fair" | "poor";
  issues?: string[]; // pilling, stains, holes, fading, etc.
  wearLevel?: "like new" | "light wear" | "moderate wear" | "heavy wear";
  repairNeeded?: boolean;
  notes?: string[];
}

// Combined extraction result for a single image
export interface ImageAnalysisResult {
  imageType: ImageType;
  tagExtraction?: TagExtraction;
  garmentAnalysis?: GarmentAnalysis;
  conditionAssessment?: ConditionAssessment;
  confidence: number; // 0-1 confidence score
  searchSuggestions?: string[]; // Suggested search queries based on this image
  clarificationNeeded?: ClarificationRequest; // When AI needs user input
}

// Merged extraction from all images in a scan
export interface ExtractedData {
  // Tag data (from tag images)
  brand?: string;
  styleNumber?: string;
  sku?: string;
  size?: string;
  materials?: string[];
  countryOfOrigin?: string;
  rnNumber?: string;
  wplNumber?: string;
  careInstructions?: string[];
  rawText: string[];
  
  // Garment analysis (from garment images)
  garmentAnalysis?: GarmentAnalysis;
  
  // Condition (from condition images)
  conditionAssessment?: ConditionAssessment;
  
  // Meta
  confidence: number;
  imageTypes: ImageType[]; // What types of images were analyzed
  searchSuggestions: string[]; // Combined search suggestions
  
  // Clarification (when AI needs user input)
  clarificationNeeded?: ClarificationRequest;
}

// ============================================
// Clarification Request (when AI needs user input)
// ============================================
export interface ClarificationOption {
  value: string;       // Machine value to store
  label: string;       // Display label for user
}

export interface ClarificationRequest {
  field: string;                    // What field we're clarifying ("category", "gender", etc.)
  question: string;                 // Human-readable question
  options: ClarificationOption[];   // 3-5 choices
  reason: string;                   // Why we're asking (for logging)
}

// ============================================
// Stage 2: Web Research Output
// ============================================
export interface Listing {
  title: string;
  price: number;
  currency: string;
  platform: string; // eBay, Poshmark, etc.
  url: string;
  condition?: string;
  soldDate?: string;
  imageUrl?: string;
}

export interface BrandInfo {
  name: string;
  description?: string;
  priceRange?: string; // "luxury", "mid-range", "budget"
  founded?: string;
  website?: string;
}

export interface ResearchResults {
  listings: Listing[];
  soldListings: Listing[]; // Completed sales for price reference
  originalRetailPrice?: {
    amount: number;
    currency: string;
    source: string;
  };
  brandInfo?: BrandInfo;
  searchQueries: string[]; // Queries used for transparency
  sources: string[]; // URLs searched
}

// ============================================
// Stage 3: AI Refinement Output
// ============================================
export interface ComparableListing {
  title: string;
  price: number;
  currency: string;
  platform: string;
  url: string;
  relevanceScore: number; // How similar to the scanned item
}

export interface RefinedFindings {
  suggestedPriceRange: {
    low: number;
    high: number;
    recommended: number;
    currency: string;
  };
  marketActivity: "hot" | "moderate" | "slow" | "rare";
  demandLevel: "high" | "medium" | "low";
  comparableListings: ComparableListing[];
  insights: string[]; // Key takeaways for the user
  brandTier?: "luxury" | "premium" | "mid-range" | "budget" | "unknown";
  seasonalFactors?: string;
  conditionImpact?: string; // How condition affects price
  confidence: number;
}

// ============================================
// AI Provider Interface (for swappability)
// ============================================
export interface AIProvider {
  name: string;
  extractFromImage(
    imageBase64: string,
    onDeviceHints?: string[]
  ): Promise<ImageAnalysisResult>;
  synthesize(prompt: string, context: unknown): Promise<string>;
}

// ============================================
// Pipeline Run Record (for audit log)
// ============================================
export interface PipelineRunRecord {
  scanId: string;
  stage: "extraction" | "research" | "refinement";
  provider: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

// ============================================
// Utility: Merge multiple image analyses
// ============================================
export function mergeImageAnalyses(analyses: ImageAnalysisResult[]): ExtractedData {
  const merged: ExtractedData = {
    rawText: [],
    confidence: 0,
    imageTypes: [],
    searchSuggestions: [],
  };

  let totalConfidence = 0;
  const allSearchSuggestions: string[] = [];

  for (const analysis of analyses) {
    merged.imageTypes.push(analysis.imageType);
    totalConfidence += analysis.confidence;

    if (analysis.searchSuggestions) {
      allSearchSuggestions.push(...analysis.searchSuggestions);
    }

    // Merge tag extraction data
    if (analysis.tagExtraction) {
      const tag = analysis.tagExtraction;
      // Prefer data from higher confidence sources
      if (!merged.brand && tag.brand) merged.brand = tag.brand;
      if (!merged.styleNumber && tag.styleNumber) merged.styleNumber = tag.styleNumber;
      if (!merged.sku && tag.sku) merged.sku = tag.sku;
      if (!merged.size && tag.size) merged.size = tag.size;
      if (!merged.materials && tag.materials) merged.materials = tag.materials;
      if (!merged.countryOfOrigin && tag.countryOfOrigin) merged.countryOfOrigin = tag.countryOfOrigin;
      if (!merged.rnNumber && tag.rnNumber) merged.rnNumber = tag.rnNumber;
      if (!merged.wplNumber && tag.wplNumber) merged.wplNumber = tag.wplNumber;
      if (!merged.careInstructions && tag.careInstructions) merged.careInstructions = tag.careInstructions;
      if (tag.rawText) merged.rawText.push(...tag.rawText);
    }

    // Take best garment analysis
    if (analysis.garmentAnalysis) {
      if (!merged.garmentAnalysis || analysis.confidence > (merged.garmentAnalysis ? 0.5 : 0)) {
        merged.garmentAnalysis = analysis.garmentAnalysis;
      }
    }

    // Take best condition assessment
    if (analysis.conditionAssessment) {
      if (!merged.conditionAssessment) {
        merged.conditionAssessment = analysis.conditionAssessment;
      }
    }
  }

  // Average confidence
  merged.confidence = analyses.length > 0 ? totalConfidence / analyses.length : 0;
  
  // Dedupe search suggestions
  merged.searchSuggestions = [...new Set(allSearchSuggestions)];

  // Use garment analysis brand if no tag brand
  if (!merged.brand && merged.garmentAnalysis?.estimatedBrand) {
    merged.brand = merged.garmentAnalysis.estimatedBrand;
  }

  // Keep only the first clarification request (one per scan)
  for (const analysis of analyses) {
    if (analysis.clarificationNeeded && !merged.clarificationNeeded) {
      merged.clarificationNeeded = analysis.clarificationNeeded;
      break;
    }
  }

  return merged;
}
