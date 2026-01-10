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

  // Audit log for pipeline runs
  pipelineRuns: defineTable({
    scanId: v.id("scans"),
    stage: v.string(),
    provider: v.string(),
    durationMs: v.number(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    details: v.optional(v.any()),
  })
    .index("by_scan", ["scanId"]),
});
