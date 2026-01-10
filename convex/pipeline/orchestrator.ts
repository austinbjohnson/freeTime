"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { ExtractedData, ResearchResults, RefinedFindings } from "./types";

/**
 * Pipeline Orchestrator
 * Chains all three stages together for a complete scan processing
 * 
 * Flow: Image → Extraction → Research → Refinement → Complete
 */

// Full pipeline execution
export const processScan = action({
  args: {
    scanId: v.id("scans"),
    imageStorageId: v.id("_storage"),
    onDeviceHints: v.optional(v.array(v.string())),
    extractionProvider: v.optional(
      v.union(v.literal("openai"), v.literal("anthropic"))
    ),
    refinementProvider: v.optional(
      v.union(v.literal("openai"), v.literal("anthropic"), v.literal("stats"))
    ),
  },
  handler: async (ctx, args) => {
    console.log(`[Pipeline] Starting processing for scan ${args.scanId}`);

    // Stage 1: Extraction
    console.log("[Pipeline] Stage 1: Extraction");
    await ctx.runMutation(internal.scans.updateStatusInternal, {
      scanId: args.scanId,
      status: "extracting",
    });

    const extractedData: ExtractedData = await ctx.runAction(
      api.pipeline.extraction.extractData,
      {
        scanId: args.scanId,
        imageStorageId: args.imageStorageId,
        onDeviceHints: args.onDeviceHints,
        provider: args.extractionProvider,
      }
    );

    console.log("[Pipeline] Extraction complete:", extractedData.brand);

    // Stage 2: Research
    console.log("[Pipeline] Stage 2: Research");
    const researchResults: ResearchResults = await ctx.runAction(
      api.pipeline.research.researchItem,
      {
        scanId: args.scanId,
        extractedData,
      }
    );

    console.log(
      `[Pipeline] Research complete: ${researchResults.listings.length} listings found`
    );

    // Stage 3: Refinement
    console.log("[Pipeline] Stage 3: Refinement");
    const refinedFindings: RefinedFindings = await ctx.runAction(
      api.pipeline.refinement.refineFindings,
      {
        scanId: args.scanId,
        extractedData,
        researchResults,
        provider: args.refinementProvider,
      }
    );

    console.log(
      `[Pipeline] Refinement complete: $${refinedFindings.suggestedPriceRange.low} - $${refinedFindings.suggestedPriceRange.high}`
    );

    console.log(`[Pipeline] Processing complete for scan ${args.scanId}`);

    return {
      extractedData,
      researchResults,
      refinedFindings,
    };
  },
});

// Process a scan starting from a specific stage (for retries)
export const processScanFromStage = action({
  args: {
    scanId: v.id("scans"),
    startStage: v.union(
      v.literal("extraction"),
      v.literal("research"),
      v.literal("refinement")
    ),
    imageStorageId: v.optional(v.id("_storage")),
    extractedData: v.optional(v.any()),
    researchResults: v.optional(v.any()),
    onDeviceHints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    let extractedData = args.extractedData as ExtractedData | undefined;
    let researchResults = args.researchResults as ResearchResults | undefined;
    let refinedFindings: RefinedFindings | undefined;

    // Start from the specified stage
    if (args.startStage === "extraction") {
      if (!args.imageStorageId) {
        throw new Error("imageStorageId required for extraction stage");
      }

      await ctx.runMutation(internal.scans.updateStatusInternal, {
        scanId: args.scanId,
        status: "extracting",
      });

      extractedData = await ctx.runAction(api.pipeline.extraction.extractData, {
        scanId: args.scanId,
        imageStorageId: args.imageStorageId,
        onDeviceHints: args.onDeviceHints,
      });
    }

    if (
      args.startStage === "extraction" ||
      args.startStage === "research"
    ) {
      if (!extractedData) {
        throw new Error("extractedData required for research stage");
      }

      researchResults = await ctx.runAction(api.pipeline.research.researchItem, {
        scanId: args.scanId,
        extractedData,
      });
    }

    if (
      args.startStage === "extraction" ||
      args.startStage === "research" ||
      args.startStage === "refinement"
    ) {
      if (!extractedData || !researchResults) {
        throw new Error(
          "extractedData and researchResults required for refinement stage"
        );
      }

      refinedFindings = await ctx.runAction(
        api.pipeline.refinement.refineFindings,
        {
          scanId: args.scanId,
          extractedData,
          researchResults,
        }
      );
    }

    return {
      extractedData,
      researchResults,
      refinedFindings,
    };
  },
});

