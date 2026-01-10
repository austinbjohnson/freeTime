"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type {
  ExtractedData,
  ResearchResults,
  RefinedFindings,
  ComparableListing,
} from "./types";

/**
 * Stage 3: AI Refinement
 * Synthesizes research results into actionable pricing insights
 * 
 * Uses AI to:
 * - Analyze comparable listings
 * - Calculate suggested price ranges
 * - Generate market insights
 */

const REFINEMENT_PROMPT = `You are a clothing resale pricing expert. Analyze the following data about a clothing item and provide pricing recommendations.

EXTRACTED TAG DATA:
{extractedData}

RESEARCH RESULTS:
- Active Listings Found: {activeCount}
- Sold Listings Found: {soldCount}
- Listings: {listings}

Based on this information, provide a JSON response with:
1. Suggested price range (low, high, recommended) in USD
2. Market activity assessment (hot/moderate/slow/rare)
3. Demand level (high/medium/low)
4. Top 5 most comparable listings with relevance scores (0-1)
5. 3-5 key insights for the seller
6. Brand tier assessment (luxury/premium/mid-range/budget/unknown)
7. Any seasonal factors affecting price
8. Overall confidence in the recommendation (0-1)

Return ONLY valid JSON in this exact format:
{
  "suggestedPriceRange": {
    "low": 0,
    "high": 0,
    "recommended": 0,
    "currency": "USD"
  },
  "marketActivity": "moderate",
  "demandLevel": "medium",
  "comparableListings": [
    {
      "title": "",
      "price": 0,
      "currency": "USD",
      "platform": "",
      "url": "",
      "relevanceScore": 0.8
    }
  ],
  "insights": ["insight 1", "insight 2"],
  "brandTier": "mid-range",
  "seasonalFactors": "None noted",
  "confidence": 0.7
}`;

// Refine using OpenAI
async function refineWithOpenAI(
  extractedData: ExtractedData,
  researchResults: ResearchResults
): Promise<RefinedFindings> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const prompt = REFINEMENT_PROMPT.replace(
    "{extractedData}",
    JSON.stringify(extractedData, null, 2)
  )
    .replace("{activeCount}", String(researchResults.listings.length))
    .replace("{soldCount}", String(researchResults.soldListings.length))
    .replace(
      "{listings}",
      JSON.stringify(
        [...researchResults.listings, ...researchResults.soldListings].slice(
          0,
          15
        ),
        null,
        2
      )
    );

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) throw new Error("No response from OpenAI");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from response");

  return JSON.parse(jsonMatch[0]) as RefinedFindings;
}

// Refine using Anthropic
async function refineWithAnthropic(
  extractedData: ExtractedData,
  researchResults: ResearchResults
): Promise<RefinedFindings> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const prompt = REFINEMENT_PROMPT.replace(
    "{extractedData}",
    JSON.stringify(extractedData, null, 2)
  )
    .replace("{activeCount}", String(researchResults.listings.length))
    .replace("{soldCount}", String(researchResults.soldListings.length))
    .replace(
      "{listings}",
      JSON.stringify(
        [...researchResults.listings, ...researchResults.soldListings].slice(
          0,
          15
        ),
        null,
        2
      )
    );

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  if (!content) throw new Error("No response from Anthropic");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from response");

  return JSON.parse(jsonMatch[0]) as RefinedFindings;
}

// Fallback: simple statistical refinement (no AI)
function refineWithStatistics(
  extractedData: ExtractedData,
  researchResults: ResearchResults
): RefinedFindings {
  const allListings = [
    ...researchResults.listings,
    ...researchResults.soldListings,
  ];

  // Filter listings with valid prices
  const pricedListings = allListings.filter((l) => l.price > 0);

  if (pricedListings.length === 0) {
    return {
      suggestedPriceRange: {
        low: 0,
        high: 0,
        recommended: 0,
        currency: "USD",
      },
      marketActivity: "rare",
      demandLevel: "low",
      comparableListings: [],
      insights: [
        "No comparable listings found with prices",
        "Consider researching this item manually",
        "The item may be rare or difficult to identify",
      ],
      confidence: 0.1,
    };
  }

  // Calculate statistics
  const prices = pricedListings.map((l) => l.price).sort((a, b) => a - b);
  const low = prices[0];
  const high = prices[prices.length - 1];
  const median = prices[Math.floor(prices.length / 2)];

  // Determine market activity
  let marketActivity: RefinedFindings["marketActivity"] = "moderate";
  if (pricedListings.length >= 10) marketActivity = "hot";
  else if (pricedListings.length <= 2) marketActivity = "rare";
  else if (pricedListings.length <= 5) marketActivity = "slow";

  // Build comparable listings
  const comparableListings: ComparableListing[] = pricedListings
    .slice(0, 5)
    .map((l, i) => ({
      ...l,
      relevanceScore: 1 - i * 0.1,
    }));

  return {
    suggestedPriceRange: {
      low,
      high,
      recommended: median,
      currency: "USD",
    },
    marketActivity,
    demandLevel: pricedListings.length >= 5 ? "medium" : "low",
    comparableListings,
    insights: [
      `Found ${pricedListings.length} comparable listings`,
      `Price range: $${low.toFixed(2)} - $${high.toFixed(2)}`,
      `Median price: $${median.toFixed(2)}`,
      extractedData.brand
        ? `Brand: ${extractedData.brand}`
        : "Brand could not be identified",
    ],
    confidence: Math.min(0.3 + pricedListings.length * 0.05, 0.7),
  };
}

// Main refinement action
export const refineFindings = action({
  args: {
    scanId: v.id("scans"),
    extractedData: v.any(),
    researchResults: v.any(),
    provider: v.optional(
      v.union(v.literal("openai"), v.literal("anthropic"), v.literal("stats"))
    ),
  },
  handler: async (ctx, args): Promise<RefinedFindings> => {
    const startTime = Date.now();
    const selectedProvider = args.provider || "anthropic";
    const extractedData = args.extractedData as ExtractedData;
    const researchResults = args.researchResults as ResearchResults;

    try {
      let refinedFindings: RefinedFindings;

      if (selectedProvider === "openai") {
        refinedFindings = await refineWithOpenAI(extractedData, researchResults);
      } else if (selectedProvider === "anthropic") {
        refinedFindings = await refineWithAnthropic(
          extractedData,
          researchResults
        );
      } else {
        refinedFindings = refineWithStatistics(extractedData, researchResults);
      }

      // Update scan with refined findings
      await ctx.runMutation(internal.scans.updateRefinedFindingsInternal, {
        scanId: args.scanId,
        refinedFindings,
      });

      // Log successful run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "refinement",
        provider: selectedProvider,
        durationMs: Date.now() - startTime,
        success: true,
      });

      return refinedFindings;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Log failed run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "refinement",
        provider: selectedProvider,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      // Try fallback to statistics
      try {
        const fallbackFindings = refineWithStatistics(
          extractedData,
          researchResults
        );
        fallbackFindings.insights.unshift(
          "AI refinement failed, using statistical analysis"
        );

        await ctx.runMutation(internal.scans.updateRefinedFindingsInternal, {
          scanId: args.scanId,
          refinedFindings: fallbackFindings,
        });

        return fallbackFindings;
      } catch {
        // Update scan status to failed
        await ctx.runMutation(internal.scans.updateStatusInternal, {
          scanId: args.scanId,
          status: "failed",
          errorMessage: `Refinement failed: ${errorMessage}`,
        });

        throw error;
      }
    }
  },
});

