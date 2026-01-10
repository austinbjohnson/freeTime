/**
 * Pipeline Types - Shared types for the processing pipeline
 * Each stage has defined input/output schemas for swappability
 */

// ============================================
// Stage 1: Data Extraction Output
// ============================================
export interface ExtractedData {
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
  confidence: number; // 0-1 confidence score
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
  ): Promise<ExtractedData>;
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

