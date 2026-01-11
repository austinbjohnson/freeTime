"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ImageAnalysisResult, ImageType } from "./types";
import { 
  withRetry, 
  formatUserError, 
  optimizeImageForAI,
  extractOpenAITokens,
  extractAnthropicTokens,
  calculateCost,
  type TokenUsage,
  type AIProvider,
} from "./utils";

/**
 * Stage 1: Smart Image Analysis
 * Analyzes clothing images - tags, garments, or condition shots
 * 
 * Features:
 * - Auto-detects image type (tag, garment, condition, detail)
 * - Extracts appropriate data based on image type
 * - Generates search suggestions for research stage
 * - Multiple provider support with fallback
 */

const SMART_EXTRACTION_PROMPT = `You are an expert clothing analyst. Analyze this image and determine what type of clothing image it is, then extract relevant information.

STEP 1: Classify the image type:
- "tag" = A clothing tag/label showing brand, size, materials, care instructions, RN numbers
- "garment" = An overall view of a clothing item showing its style, pattern, construction
- "condition" = A close-up showing wear, damage, stains, or quality details
- "detail" = A specific feature like buttons, zipper, logo, stitching
- "unknown" = Cannot determine what this image shows

STEP 2: READ ALL VISIBLE TEXT - This is critical!
- Look carefully for ANY brand logos, labels, or text visible in the image
- Even in "garment" images, brands often appear on small labels, patches, or embroidered logos
- Common label locations: front pocket, collar, hem, interior, straps, zippers
- Read the EXACT text - don't describe it, transcribe it (e.g., "TOPO DESIGNS" not "appears to be outdoor brand")
- If you see a logo but can't read the text clearly, note what you can see

STEP 3: Based on the image type, extract relevant information.

Return a JSON object in this EXACT format:
{
  "imageType": "tag" | "garment" | "condition" | "detail" | "unknown",
  
  "tagExtraction": {
    "brand": "Brand name if visible",
    "styleNumber": "Style/model number",
    "sku": "SKU or product code",
    "size": "Size (S, M, L, 32, etc.)",
    "materials": ["100% Cotton", "80% Wool, 20% Nylon"],
    "countryOfOrigin": "Made in country",
    "rnNumber": "RN number (US registration)",
    "wplNumber": "WPL number",
    "careInstructions": ["Machine wash cold", "Tumble dry low"],
    "rawText": ["All", "visible", "text", "on", "tag"]
  },
  
  "garmentAnalysis": {
    "category": "Be specific: 'tote bag' not just 'bag', 'fleece jacket' not just 'jacket', etc.",
    "style": "Specific style name (e.g., Cowichan, varsity, bomber, messenger, tote, duffel)",
    "estimatedEra": "vintage/1980s/modern/etc.",
    "colors": ["cream", "brown", "navy"],
    "patterns": ["geometric", "stripes", "floral", "solid"],
    "construction": "hand-knit/machine-knit/woven/canvas/nylon/etc.",
    "estimatedBrand": "EXACT brand name if visible on any label/logo (e.g., 'Topo Designs', 'Patagonia'). Only use a description if NO brand text is visible.",
    "estimatedOrigin": "Geographic/cultural origin if identifiable",
    "notableFeatures": ["whale motif", "shawl collar", "zipper front", "brand label on pocket"]
  },
  
  "conditionAssessment": {
    "overallGrade": "excellent/very good/good/fair/poor",
    "issues": ["pilling", "small stain on front", "loose button"],
    "wearLevel": "like new/light wear/moderate wear/heavy wear",
    "repairNeeded": true/false,
    "notes": ["Overall good condition for vintage"]
  },
  
  "confidence": 0.85,
  "searchSuggestions": ["search query 1", "search query 2", "search query 3"]
}

RULES:
1. Only include sections relevant to the image type:
   - "tag" images: include tagExtraction
   - "garment" images: include garmentAnalysis
   - "condition" images: include conditionAssessment
   - "detail" images: include relevant section based on what's shown
   - "unknown" images: minimal data with low confidence

2. searchSuggestions should be helpful search queries for finding similar items online, e.g.:
   - "Cowichan sweater vintage hand knit"
   - "Patagonia STY25455 fleece jacket"
   - Brand + style + key features

3. Set confidence between 0 and 1 based on image clarity and certainty of analysis.

4. Return ONLY valid JSON, no markdown formatting or explanation.`;

// Result type that includes token usage
interface AnalysisResultWithTokens {
  result: ImageAnalysisResult;
  tokenUsage: TokenUsage | null;
}

// Analyze image using OpenAI GPT-4 Vision
async function analyzeWithOpenAI(
  imageBase64: string,
  onDeviceHints?: string[]
): Promise<AnalysisResultWithTokens> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const hintsContext = onDeviceHints?.length
    ? `\n\nOn-device OCR detected these text fragments (may help): ${onDeviceHints.join(", ")}`
    : "";

  return withRetry(async () => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Model: Only change with explicit user approval
        model: "gpt-5-mini-2025-08-07",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SMART_EXTRACTION_PROMPT + hintsContext },
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
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) throw new Error("No response from OpenAI");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse JSON from response");

    const parsed = JSON.parse(jsonMatch[0]);
    const tokenUsage = extractOpenAITokens(data);
    
    return {
      result: normalizeAnalysisResult(parsed),
      tokenUsage,
    };
  }, { maxRetries: 2 });
}

// Analyze image using Anthropic Claude Vision
async function analyzeWithAnthropic(
  imageBase64: string,
  onDeviceHints?: string[]
): Promise<AnalysisResultWithTokens> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const hintsContext = onDeviceHints?.length
    ? `\n\nOn-device OCR detected these text fragments (may help): ${onDeviceHints.join(", ")}`
    : "";

  return withRetry(async () => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Model: Only change with explicit user approval
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
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
              { type: "text", text: SMART_EXTRACTION_PROMPT + hintsContext },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text;

    if (!content) throw new Error("No response from Anthropic");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse JSON from response");

    const parsed = JSON.parse(jsonMatch[0]);
    const tokenUsage = extractAnthropicTokens(data);
    
    return {
      result: normalizeAnalysisResult(parsed),
      tokenUsage,
    };
  }, { maxRetries: 2 });
}

// Check if a brand string looks like a valid brand name vs a verbose description
function isValidBrandName(brand: string | undefined): boolean {
  if (!brand) return false;
  
  // Too long to be a brand name (most brand names are <30 chars)
  if (brand.length > 40) return false;
  
  // Contains description phrases - not a brand name
  const descriptionPhrases = [
    "appears to be",
    "based on",
    "likely",
    "possibly",
    "seems to be",
    "could be",
    "probably",
    "unknown",
    "unidentified",
    "generic",
    "contemporary",
    "vintage style",
    "quality",
    "construction",
  ];
  
  const lowerBrand = brand.toLowerCase();
  for (const phrase of descriptionPhrases) {
    if (lowerBrand.includes(phrase)) return false;
  }
  
  // Contains too many words (brand names rarely have >4 words)
  const wordCount = brand.trim().split(/\s+/).length;
  if (wordCount > 5) return false;
  
  return true;
}

// Normalize and validate the analysis result
function normalizeAnalysisResult(raw: Record<string, unknown>): ImageAnalysisResult {
  const imageType = (raw.imageType as ImageType) || "unknown";
  
  const result: ImageAnalysisResult = {
    imageType,
    confidence: typeof raw.confidence === "number" 
      ? Math.max(0, Math.min(1, raw.confidence)) 
      : 0.5,
    searchSuggestions: Array.isArray(raw.searchSuggestions) 
      ? raw.searchSuggestions 
      : [],
  };

  // Add tag extraction if present
  if (raw.tagExtraction && typeof raw.tagExtraction === "object") {
    const tag = raw.tagExtraction as Record<string, unknown>;
    result.tagExtraction = {
      brand: tag.brand as string | undefined,
      styleNumber: tag.styleNumber as string | undefined,
      sku: tag.sku as string | undefined,
      size: tag.size as string | undefined,
      materials: Array.isArray(tag.materials) ? tag.materials : undefined,
      countryOfOrigin: tag.countryOfOrigin as string | undefined,
      rnNumber: tag.rnNumber as string | undefined,
      wplNumber: tag.wplNumber as string | undefined,
      careInstructions: Array.isArray(tag.careInstructions) ? tag.careInstructions : undefined,
      rawText: Array.isArray(tag.rawText) ? tag.rawText : [],
    };
  }

  // Add garment analysis if present
  if (raw.garmentAnalysis && typeof raw.garmentAnalysis === "object") {
    const garment = raw.garmentAnalysis as Record<string, unknown>;
    result.garmentAnalysis = {
      category: garment.category as string | undefined,
      style: garment.style as string | undefined,
      estimatedEra: garment.estimatedEra as string | undefined,
      colors: Array.isArray(garment.colors) ? garment.colors : [],
      patterns: Array.isArray(garment.patterns) ? garment.patterns : undefined,
      construction: garment.construction as string | undefined,
      estimatedBrand: garment.estimatedBrand as string | undefined,
      estimatedOrigin: garment.estimatedOrigin as string | undefined,
      notableFeatures: Array.isArray(garment.notableFeatures) ? garment.notableFeatures : undefined,
    };
  }

  // Add condition assessment if present
  if (raw.conditionAssessment && typeof raw.conditionAssessment === "object") {
    const condition = raw.conditionAssessment as Record<string, unknown>;
    result.conditionAssessment = {
      overallGrade: (condition.overallGrade as "excellent" | "very good" | "good" | "fair" | "poor") || "good",
      issues: Array.isArray(condition.issues) ? condition.issues : undefined,
      wearLevel: condition.wearLevel as "like new" | "light wear" | "moderate wear" | "heavy wear" | undefined,
      repairNeeded: typeof condition.repairNeeded === "boolean" ? condition.repairNeeded : undefined,
      notes: Array.isArray(condition.notes) ? condition.notes : undefined,
    };
  }

  return result;
}

// Main extraction action - analyzes a single image
export const analyzeImage = action({
  args: {
    scanId: v.id("scans"),
    imageStorageId: v.id("_storage"),
    scanImageId: v.optional(v.id("scanImages")), // If using multi-image
    onDeviceHints: v.optional(v.array(v.string())),
    provider: v.optional(v.union(v.literal("openai"), v.literal("anthropic"))),
  },
  handler: async (ctx, args): Promise<ImageAnalysisResult> => {
    const startTime = Date.now();
    const primaryProvider = args.provider || "anthropic";
    const fallbackProvider = primaryProvider === "anthropic" ? "openai" : "anthropic";
    
    let usedProvider: AIProvider = primaryProvider;
    let analysisResult: ImageAnalysisResult | null = null;
    let tokenUsage: TokenUsage | null = null;
    let primaryError: Error | null = null;

    try {
      // Get image from Convex storage
      const imageUrl = await ctx.storage.getUrl(args.imageStorageId);
      if (!imageUrl) throw new Error("Image not found in storage");

      // Fetch and optimize for AI API limits
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = await optimizeImageForAI(Buffer.from(imageBuffer));

      // Try primary provider first
      try {
        console.log(`[Analysis] Trying ${primaryProvider}...`);
        let response: AnalysisResultWithTokens;
        if (primaryProvider === "openai") {
          response = await analyzeWithOpenAI(imageBase64, args.onDeviceHints);
        } else {
          response = await analyzeWithAnthropic(imageBase64, args.onDeviceHints);
        }
        analysisResult = response.result;
        tokenUsage = response.tokenUsage;
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error(String(error));
        console.log(`[Analysis] ${primaryProvider} failed: ${primaryError.message}`);
        
        // Try fallback provider
        console.log(`[Analysis] Trying fallback ${fallbackProvider}...`);
        usedProvider = fallbackProvider;
        
        let response: AnalysisResultWithTokens;
        if (fallbackProvider === "openai") {
          response = await analyzeWithOpenAI(imageBase64, args.onDeviceHints);
        } else {
          response = await analyzeWithAnthropic(imageBase64, args.onDeviceHints);
        }
        analysisResult = response.result;
        tokenUsage = response.tokenUsage;
      }

      // If using scanImages table, update the specific image record
      if (args.scanImageId) {
        await ctx.runMutation(internal.scans.updateScanImageAnalysis, {
          scanImageId: args.scanImageId,
          imageType: analysisResult.imageType,
          analysisResult,
        });
      }

      // Calculate cost if we have token usage
      const estimatedCostUsd = tokenUsage 
        ? calculateCost(usedProvider, tokenUsage.inputTokens, tokenUsage.outputTokens)
        : undefined;

      // Log token usage
      if (tokenUsage) {
        console.log(`[Analysis] Tokens: ${tokenUsage.inputTokens} in, ${tokenUsage.outputTokens} out, cost: $${estimatedCostUsd?.toFixed(6)}`);
      }

      // Log successful run with token metrics
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "extraction",
        provider: usedProvider,
        durationMs: Date.now() - startTime,
        success: true,
        details: {
          imageType: analysisResult.imageType,
          confidence: analysisResult.confidence,
          fallbackUsed: primaryError ? true : false,
        },
        // Token metrics
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
        totalTokens: tokenUsage?.totalTokens,
        estimatedCostUsd,
      });

      return analysisResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const userFriendlyError = formatUserError(error instanceof Error ? error : new Error(errorMessage));

      // Log failed run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "extraction",
        provider: usedProvider,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
        details: { 
          primaryProvider,
          fallbackProvider,
          primaryError: primaryError?.message,
        },
      });

      // Update scan status to failed
      await ctx.runMutation(internal.scans.updateStatusInternal, {
        scanId: args.scanId,
        status: "failed",
        errorMessage: userFriendlyError,
      });

      throw error;
    }
  },
});

// Legacy action for backwards compatibility (analyzes single image and updates scan)
export const extractData = action({
  args: {
    scanId: v.id("scans"),
    imageStorageId: v.id("_storage"),
    onDeviceHints: v.optional(v.array(v.string())),
    provider: v.optional(v.union(v.literal("openai"), v.literal("anthropic"))),
  },
  handler: async (ctx, args) => {
    // Use the new analyzeImage action
    const result = await ctx.runAction(internal.pipeline.extraction.analyzeImage, {
      scanId: args.scanId,
      imageStorageId: args.imageStorageId,
      onDeviceHints: args.onDeviceHints,
      provider: args.provider,
    });

    // Get the extracted/estimated brand
    let rawBrand = result.tagExtraction?.brand || result.garmentAnalysis?.estimatedBrand;
    let brand: string | undefined;
    let brandTier: string | undefined;
    let brandResolved = false;
    let brandNotes: string | undefined;

    // Validate brand - reject verbose descriptions
    if (rawBrand) {
      if (isValidBrandName(rawBrand)) {
        brand = rawBrand;
        
        // Resolve brand against our database
        const brandInfo = await ctx.runQuery(internal.brands.resolveBrand, {
          brandName: brand,
        });
        
        if (brandInfo.found) {
          brand = brandInfo.canonical; // Use canonical name
          brandTier = brandInfo.tier;
          brandResolved = true;
          console.log(`[Extraction] Brand resolved: "${rawBrand}" → "${brand}" (${brandTier})`);
        } else {
          console.log(`[Extraction] Brand not in database: "${brand}"`);
        }
      } else {
        // Brand field contains a description, not a brand name
        console.log(`[Extraction] Invalid brand (description detected): "${rawBrand.slice(0, 50)}..."`);
        brandNotes = rawBrand; // Save for reference
        brand = undefined;
      }
    }

    // Convert ImageAnalysisResult to legacy ExtractedData format
    const extractedData = {
      brand,
      brandTier,
      brandResolved,
      brandNotes, // Stores description if brand field contained invalid verbose text
      styleNumber: result.tagExtraction?.styleNumber,
      sku: result.tagExtraction?.sku,
      size: result.tagExtraction?.size,
      materials: result.tagExtraction?.materials,
      countryOfOrigin: result.tagExtraction?.countryOfOrigin || result.garmentAnalysis?.estimatedOrigin,
      rnNumber: result.tagExtraction?.rnNumber,
      wplNumber: result.tagExtraction?.wplNumber,
      careInstructions: result.tagExtraction?.careInstructions,
      rawText: result.tagExtraction?.rawText || [],
      garmentAnalysis: result.garmentAnalysis,
      conditionAssessment: result.conditionAssessment,
      confidence: result.confidence,
      imageTypes: [result.imageType],
      searchSuggestions: result.searchSuggestions || [],
    };

    // Update scan with extracted data
    await ctx.runMutation(internal.scans.updateExtractedDataInternal, {
      scanId: args.scanId,
      extractedData,
    });

    return extractedData;
  },
});
