"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ExtractedData } from "./types";

/**
 * Stage 1: Data Extraction
 * Extracts structured data from clothing tag images using AI vision
 * 
 * Supports multiple providers (abstracted for swappability):
 * - OpenAI GPT-4 Vision
 * - Anthropic Claude Vision
 */

const EXTRACTION_PROMPT = `You are analyzing a clothing tag image. Extract all visible information and return a JSON object with the following fields (include only fields you can clearly identify):

{
  "brand": "Brand name",
  "styleNumber": "Style number or style code",
  "sku": "SKU or product code",
  "size": "Size (e.g., M, L, 32, etc.)",
  "materials": ["Array of materials with percentages if shown"],
  "countryOfOrigin": "Country where made",
  "rnNumber": "RN number (US registration)",
  "wplNumber": "WPL number (Wool Products Label)",
  "careInstructions": ["Array of care instructions"],
  "rawText": ["Array of all visible text on the tag"],
  "confidence": 0.85
}

Set confidence between 0 and 1 based on image clarity and text readability.
Return ONLY valid JSON, no markdown formatting.`;

// Extract data using OpenAI GPT-4 Vision
async function extractWithOpenAI(
  imageBase64: string,
  onDeviceHints?: string[]
): Promise<ExtractedData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const hintsContext = onDeviceHints?.length
    ? `\n\nOn-device OCR detected these text fragments (may help): ${onDeviceHints.join(", ")}`
    : "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT + hintsContext },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) throw new Error("No response from OpenAI");

  // Parse JSON from response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from response");

  return JSON.parse(jsonMatch[0]) as ExtractedData;
}

// Extract data using Anthropic Claude Vision
async function extractWithAnthropic(
  imageBase64: string,
  onDeviceHints?: string[]
): Promise<ExtractedData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const hintsContext = onDeviceHints?.length
    ? `\n\nOn-device OCR detected these text fragments (may help): ${onDeviceHints.join(", ")}`
    : "";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT + hintsContext },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  if (!content) throw new Error("No response from Anthropic");

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from response");

  return JSON.parse(jsonMatch[0]) as ExtractedData;
}

// Main extraction action
export const extractData = action({
  args: {
    scanId: v.id("scans"),
    imageStorageId: v.id("_storage"),
    onDeviceHints: v.optional(v.array(v.string())),
    provider: v.optional(v.union(v.literal("openai"), v.literal("anthropic"))),
  },
  handler: async (ctx, args): Promise<ExtractedData> => {
    const startTime = Date.now();
    const selectedProvider = args.provider || "anthropic"; // Default to Anthropic

    try {
      // Get image from Convex storage
      const imageUrl = await ctx.storage.getUrl(args.imageStorageId);
      if (!imageUrl) throw new Error("Image not found in storage");

      // Fetch and convert to base64
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString("base64");

      // Extract using selected provider
      let extractedData: ExtractedData;
      if (selectedProvider === "openai") {
        extractedData = await extractWithOpenAI(imageBase64, args.onDeviceHints);
      } else {
        extractedData = await extractWithAnthropic(imageBase64, args.onDeviceHints);
      }

      // Update scan with extracted data
      await ctx.runMutation(internal.scans.updateExtractedDataInternal, {
        scanId: args.scanId,
        extractedData,
      });

      // Log successful run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "extraction",
        provider: selectedProvider,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return extractedData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log failed run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "extraction",
        provider: selectedProvider,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      // Update scan status to failed
      await ctx.runMutation(internal.scans.updateStatusInternal, {
        scanId: args.scanId,
        status: "failed",
        errorMessage: `Extraction failed: ${errorMessage}`,
      });

      throw error;
    }
  },
});

