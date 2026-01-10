import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Pipeline Logging - Internal mutations for audit logging
 * Separated from action files because mutations can't be in "use node" files
 */

// Log a pipeline run to the audit table
export const logPipelineRun = internalMutation({
  args: {
    scanId: v.id("scans"),
    stage: v.string(),
    provider: v.string(),
    durationMs: v.number(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    details: v.optional(v.any()), // Additional metadata for debugging
    // Token usage metrics (for AI stages)
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("pipelineRuns", args);
  },
});

