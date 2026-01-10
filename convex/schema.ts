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

  // Clothing tag scans
  scans: defineTable({
    userId: v.id("users"),
    imageStorageId: v.id("_storage"),
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
    extractedData: v.optional(v.any()),
    researchResults: v.optional(v.any()),
    refinedFindings: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Audit log for pipeline runs
  pipelineRuns: defineTable({
    scanId: v.id("scans"),
    stage: v.string(),
    provider: v.string(),
    durationMs: v.number(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  })
    .index("by_scan", ["scanId"]),
});

