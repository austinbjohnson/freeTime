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
});
