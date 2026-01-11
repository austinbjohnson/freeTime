import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users synced from WorkOS
  users: defineTable({
    workosId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  })
    .index("by_workos_id", ["workosId"])
    .index("by_email", ["email"]),

  // Clothing scans (supports multiple images)
  scans: defineTable({
    userId: v.id("users"),
    // Legacy single image support (deprecated, use scanImages)
    imageStorageId: v.optional(v.id("_storage")),
    thumbnailStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("uploaded"),
      v.literal("extracting"),
      v.literal("researching"),
      v.literal("refining"),
      v.literal("completed"),
      v.literal("failed")
    ),
    // Pipeline outputs (populated as each stage completes)
    extractedData: v.optional(v.any()), // Combined/merged extraction
    researchResults: v.optional(v.any()),
    refinedFindings: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Individual images for a scan (supports multiple per scan)
  scanImages: defineTable({
    scanId: v.id("scans"),
    imageStorageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
    // Image classification
    imageType: v.union(
      v.literal("tag"),        // Clothing tag/label
      v.literal("garment"),    // Overall garment shot
      v.literal("condition"),  // Wear and tear detail
      v.literal("detail"),     // Close-up of specific feature
      v.literal("unknown")     // Not yet classified
    ),
    // Extraction results for this specific image
    analysisResult: v.optional(v.any()),
    // Processing status
    processed: v.boolean(),
    errorMessage: v.optional(v.string()),
  })
    .index("by_scan", ["scanId"])
    .index("by_type", ["scanId", "imageType"]),

  // Brand reference database
  brands: defineTable({
    name: v.string(),                    // Canonical name: "Ralph Lauren"
    aliases: v.array(v.string()),        // ["POLO RALPH LAUREN", "POLO RL"]
    tier: v.union(
      v.literal("luxury"),
      v.literal("premium"),
      v.literal("mid-range"),
      v.literal("budget"),
      v.literal("vintage"),
      v.literal("unknown")
    ),
    parentCompany: v.optional(v.string()),
    categories: v.array(v.string()),     // ["apparel", "accessories"]
    rnNumbers: v.optional(v.array(v.string())),  // Known US RN registrations
    wplNumbers: v.optional(v.array(v.string())), // Wool Products Label numbers
    founded: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Stats enriched from scan analytics (future)
    avgResalePrice: v.optional(v.number()),
    scanCount: v.optional(v.number()),
    priceConfidence: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .searchIndex("search_name", { searchField: "name" })
    .searchIndex("search_aliases", { searchField: "aliases" }),

  // Audit log for pipeline runs
  pipelineRuns: defineTable({
    scanId: v.id("scans"),
    stage: v.string(),
    provider: v.string(),
    durationMs: v.number(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    details: v.optional(v.any()),
    // Token usage metrics (for AI stages)
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
  })
    .index("by_scan", ["scanId"])
    .index("by_stage", ["stage"])
    .index("by_provider", ["provider"]),

  // ============================================
  // Anonymized Scan Analytics (Crowdsourced Data)
  // ============================================

  // Raw anonymized scan data for crowdsourced pricing intelligence
  // NO PII: userId, imageStorageId, precise timestamps, location
  scanAnalytics: defineTable({
    // Content hash for deduplication (hash of brand+style+category)
    contentHash: v.string(),
    
    // Item identification (anonymized)
    brand: v.optional(v.string()),           // Canonical brand name
    brandTier: v.optional(v.string()),       // luxury/premium/mid-range/budget
    category: v.optional(v.string()),        // sweater/jacket/pants/etc
    style: v.optional(v.string()),           // Cowichan/varsity/bomber/etc
    
    // Item attributes
    materials: v.optional(v.array(v.string())),
    countryOfOrigin: v.optional(v.string()),
    estimatedEra: v.optional(v.string()),    // vintage/1980s/modern/etc
    
    // Condition data
    conditionGrade: v.optional(v.string()),  // excellent/very good/good/fair/poor
    
    // Pricing data (the gold!)
    priceLow: v.optional(v.number()),
    priceHigh: v.optional(v.number()),
    priceRecommended: v.optional(v.number()),
    currency: v.string(),                    // USD, CAD, EUR, etc
    
    // Market intelligence
    marketActivity: v.optional(v.string()),  // hot/moderate/slow/rare
    demandLevel: v.optional(v.string()),     // high/medium/low
    activeListingsCount: v.optional(v.number()),
    soldListingsCount: v.optional(v.number()),
    
    // Confidence and quality
    confidence: v.optional(v.number()),      // 0-1 from refinement
    
    // Coarse time bucket for trends (privacy-safe)
    timeBucket: v.string(),                  // "2026-01" (YYYY-MM format)
  })
    .index("by_content_hash", ["contentHash"])
    .index("by_brand", ["brand"])
    .index("by_brand_category", ["brand", "category"])
    .index("by_time_bucket", ["timeBucket"]),

  // Aggregated brand statistics (computed from scanAnalytics)
  brandStats: defineTable({
    // Composite key: brand + category + condition (or "all" for totals)
    brand: v.string(),
    category: v.string(),                    // Specific category or "_all"
    conditionGrade: v.string(),              // Specific grade or "_all"
    
    // Sample metrics
    sampleSize: v.number(),
    
    // Price statistics (in USD)
    priceMin: v.number(),
    priceMax: v.number(),
    priceAvg: v.number(),
    priceMedian: v.number(),
    priceP25: v.number(),                    // 25th percentile
    priceP75: v.number(),                    // 75th percentile
    
    // Market activity
    avgMarketActivity: v.optional(v.string()), // Most common activity level
    avgDemandLevel: v.optional(v.string()),    // Most common demand level
    
    // Trend data
    priceChange30d: v.optional(v.number()),  // % change vs 30 days ago
    volumeChange30d: v.optional(v.number()), // % change in scan volume
    
    // Last updated
    lastUpdated: v.number(),                 // Unix timestamp
  })
    .index("by_brand", ["brand"])
    .index("by_brand_category", ["brand", "category"])
    .index("by_brand_category_condition", ["brand", "category", "conditionGrade"]),

  // User analytics preferences
  userAnalyticsPrefs: defineTable({
    userId: v.id("users"),
    contributesToAnalytics: v.boolean(),     // Default: true (opt-out available)
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // ============================================
  // Research Cache (Brand Code Decoding & Lookups)
  // ============================================

  // Cache decoded style codes and research results to avoid redundant lookups
  researchCache: defineTable({
    // Key fields for matching
    brand: v.string(),                        // Canonical brand name (uppercase)
    normalizedCode: v.string(),               // Normalized style/SKU code
    
    // Decoded information from brand-specific decoder
    decodedInfo: v.optional(v.object({
      productLine: v.optional(v.string()),
      category: v.optional(v.string()),
      season: v.optional(v.string()),
      year: v.optional(v.string()),
      gender: v.optional(v.string()),
      material: v.optional(v.string()),
      patternType: v.optional(v.string()),
      confidence: v.number(),
      searchTerms: v.array(v.string()),
    })),
    
    // Cached market data (optional, expires)
    marketData: v.optional(v.object({
      avgPrice: v.optional(v.number()),
      priceRangeLow: v.optional(v.number()),
      priceRangeHigh: v.optional(v.number()),
      currency: v.string(),
      listingsFound: v.number(),
      soldListingsFound: v.number(),
      marketActivity: v.optional(v.string()),
      sources: v.array(v.string()),
    })),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
    hitCount: v.number(),                     // How many times this cache entry was used
    lastHitAt: v.optional(v.number()),
  })
    .index("by_brand_code", ["brand", "normalizedCode"])
    .index("by_brand", ["brand"])
    .index("by_updated", ["updatedAt"]),
});
