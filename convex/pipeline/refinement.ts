"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type {
  ExtractedData,
  ResearchResults,
  RefinedFindings,
  ComparableListing,
} from "./types";
import { 
  withRetry, 
  formatUserError,
  extractOpenAITokens,
  extractAnthropicTokens,
  calculateCost,
  type TokenUsage,
  type AIProvider,
} from "./utils";

// Type for brand stats from analytics
interface BrandStats {
  brand: string;
  sampleSize: number;
  priceMin: number;
  priceMax: number;
  priceAvg: number;
  priceMedian: number;
  priceP25: number;
  priceP75: number;
  avgMarketActivity?: string;
  avgDemandLevel?: string;
}

function countCurrencies(listings: Array<{ currency: string }>): Record<string, number> {
  return listings.reduce<Record<string, number>>((acc, listing) => {
    const currency = listing.currency || "USD";
    acc[currency] = (acc[currency] || 0) + 1;
    return acc;
  }, {});
}

function resolveMarketContext(researchResults: ResearchResults) {
  const currencyCounts =
    researchResults.currencyCounts ||
    countCurrencies([...researchResults.listings, ...researchResults.soldListings]);
  const primaryCurrency =
    researchResults.primaryCurrency ||
    Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "USD";
  const marketRegion = researchResults.marketRegion || "US";

  return { primaryCurrency, marketRegion, currencyCounts };
}

/**
 * Stage 3: AI Refinement
 * Synthesizes research results into actionable pricing insights
 * 
 * Features:
 * - Multiple AI providers (OpenAI, Anthropic)
 * - Retry logic with exponential backoff
 * - Provider fallback on failure
 * - Analyzes comparable listings
 * - Calculates suggested price ranges
 * - Generates market insights
 */

const REFINEMENT_PROMPT = `You are a clothing resale pricing expert. Analyze the following data about a clothing item and provide pricing recommendations.

EXTRACTED TAG DATA:
{extractedData}

RESEARCH RESULTS:
- Active Listings Found: {activeCount}
- Sold Listings Found: {soldCount}
- Listings: {listings}

MARKET CONTEXT:
- Region: {marketRegion}
- Primary currency: {primaryCurrency}
- Currency mix: {currencyMix}

{historicalContext}

Based on this information, provide a JSON response with:
1. Suggested price range (low, high, recommended) in {primaryCurrency}
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
    "currency": "{primaryCurrency}"
  },
  "marketActivity": "moderate",
  "demandLevel": "medium",
  "comparableListings": [
    {
      "title": "",
      "price": 0,
      "currency": "{primaryCurrency}",
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

// Result type that includes token usage
interface RefinementResultWithTokens {
  result: RefinedFindings;
  tokenUsage: TokenUsage | null;
}

// Refine using OpenAI (with retry)
async function refineWithOpenAI(
  extractedData: ExtractedData,
  researchResults: ResearchResults,
  historicalContext: string = ""
): Promise<RefinementResultWithTokens> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const { primaryCurrency, marketRegion, currencyCounts } = resolveMarketContext(researchResults);

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
    )
    .replace("{marketRegion}", marketRegion)
    .replaceAll("{primaryCurrency}", primaryCurrency)
    .replace("{currencyMix}", JSON.stringify(currencyCounts))
    .replace("{historicalContext}", historicalContext);

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
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
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

    const tokenUsage = extractOpenAITokens(data);
    
    return {
      result: JSON.parse(jsonMatch[0]) as RefinedFindings,
      tokenUsage,
    };
  }, { maxRetries: 2 });
}

// Refine using Anthropic (with retry)
async function refineWithAnthropic(
  extractedData: ExtractedData,
  researchResults: ResearchResults,
  historicalContext: string = ""
): Promise<RefinementResultWithTokens> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const { primaryCurrency, marketRegion, currencyCounts } = resolveMarketContext(researchResults);

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
    )
    .replace("{marketRegion}", marketRegion)
    .replaceAll("{primaryCurrency}", primaryCurrency)
    .replace("{currencyMix}", JSON.stringify(currencyCounts))
    .replace("{historicalContext}", historicalContext);

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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
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

    const tokenUsage = extractAnthropicTokens(data);
    
    return {
      result: JSON.parse(jsonMatch[0]) as RefinedFindings,
      tokenUsage,
    };
  }, { maxRetries: 2 });
}

// Fallback: simple statistical refinement (no AI)
function refineWithStatistics(
  extractedData: ExtractedData,
  researchResults: ResearchResults
): RefinedFindings {
  const { primaryCurrency, currencyCounts } = resolveMarketContext(researchResults);
  const multipleCurrencies = Object.keys(currencyCounts).length > 1;
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
        currency: primaryCurrency,
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
      currency: primaryCurrency,
    },
    marketActivity,
    demandLevel: pricedListings.length >= 5 ? "medium" : "low",
    comparableListings,
    insights: [
      `Found ${pricedListings.length} comparable listings`,
      `Price range: ${primaryCurrency} ${low.toFixed(2)} - ${primaryCurrency} ${high.toFixed(2)}`,
      `Median price: ${primaryCurrency} ${median.toFixed(2)}`,
      multipleCurrencies
        ? `Currency mix detected: ${Object.keys(currencyCounts).join(", ")}`
        : `Currency: ${primaryCurrency}`,
      extractedData.brand
        ? `Brand: ${extractedData.brand}`
        : "Brand could not be identified",
    ],
    confidence: Math.min(0.3 + pricedListings.length * 0.05, 0.7),
  };
}

// Main refinement action with provider fallback
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
    const primaryProvider = args.provider || "anthropic";
    const fallbackProvider = primaryProvider === "anthropic" ? "openai" : "anthropic";
    const extractedData = args.extractedData as ExtractedData;
    const researchResults = args.researchResults as ResearchResults;
    
    let usedProvider: AIProvider | "stats" = primaryProvider === "stats" ? "stats" : primaryProvider;
    let refinedFindings: RefinedFindings | null = null;
    let tokenUsage: TokenUsage | null = null;
    let primaryError: Error | null = null;
    
    // Query historical brand stats for context
    let historicalContext = "";
    if (extractedData.brand) {
      try {
        const brandStats = await ctx.runQuery(api.analytics.getBrandStats, {
          brand: extractedData.brand,
          category: extractedData.garmentAnalysis?.category,
          conditionGrade: extractedData.conditionAssessment?.overallGrade,
        }) as BrandStats | null;
        
        if (brandStats && brandStats.sampleSize >= 3) {
          historicalContext = `HISTORICAL DATA (from ${brandStats.sampleSize} similar items):
- Price Range: $${brandStats.priceMin.toFixed(0)} - $${brandStats.priceMax.toFixed(0)}
- Average Price: $${brandStats.priceAvg.toFixed(0)}
- Median Price: $${brandStats.priceMedian.toFixed(0)}
- 25th-75th Percentile: $${brandStats.priceP25.toFixed(0)} - $${brandStats.priceP75.toFixed(0)}
${brandStats.avgMarketActivity ? `- Typical Market Activity: ${brandStats.avgMarketActivity}` : ""}
${brandStats.avgDemandLevel ? `- Typical Demand Level: ${brandStats.avgDemandLevel}` : ""}

Consider this historical data when making your price recommendations.`;
          console.log(`[Refinement] Found historical data for ${extractedData.brand}: ${brandStats.sampleSize} samples`);
        }
      } catch (error) {
        // Don't fail if analytics query fails
        console.log("[Refinement] Could not fetch brand stats:", error);
      }
    }

    // If stats requested, just do stats
    if (primaryProvider === "stats") {
      refinedFindings = refineWithStatistics(extractedData, researchResults);
      
      await ctx.runMutation(internal.scans.updateRefinedFindingsInternal, {
        scanId: args.scanId,
        refinedFindings,
      });

      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "refinement",
        provider: "stats",
        durationMs: Date.now() - startTime,
        success: true,
      });

      return refinedFindings;
    }

    try {
      // Try primary AI provider
      try {
        console.log(`[Refinement] Trying ${primaryProvider}...`);
        let response: RefinementResultWithTokens;
        if (primaryProvider === "openai") {
          response = await refineWithOpenAI(extractedData, researchResults, historicalContext);
        } else {
          response = await refineWithAnthropic(extractedData, researchResults, historicalContext);
        }
        refinedFindings = response.result;
        tokenUsage = response.tokenUsage;
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error(String(error));
        console.log(`[Refinement] ${primaryProvider} failed: ${primaryError.message}`);
        
        // Try fallback AI provider
        console.log(`[Refinement] Trying fallback ${fallbackProvider}...`);
        usedProvider = fallbackProvider;
        
        let response: RefinementResultWithTokens;
        if (fallbackProvider === "openai") {
          response = await refineWithOpenAI(extractedData, researchResults, historicalContext);
        } else {
          response = await refineWithAnthropic(extractedData, researchResults, historicalContext);
        }
        refinedFindings = response.result;
        tokenUsage = response.tokenUsage;
      }

      // Update scan with refined findings
      await ctx.runMutation(internal.scans.updateRefinedFindingsInternal, {
        scanId: args.scanId,
        refinedFindings,
      });

      // Calculate cost if we have token usage
      const estimatedCostUsd = tokenUsage && usedProvider !== "stats"
        ? calculateCost(usedProvider, tokenUsage.inputTokens, tokenUsage.outputTokens)
        : undefined;

      // Log token usage
      if (tokenUsage) {
        console.log(`[Refinement] Tokens: ${tokenUsage.inputTokens} in, ${tokenUsage.outputTokens} out, cost: $${estimatedCostUsd?.toFixed(6)}`);
      }

      // Log successful run with token metrics
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "refinement",
        provider: usedProvider,
        durationMs: Date.now() - startTime,
        success: true,
        details: primaryError ? { fallbackUsed: true, primaryError: primaryError.message } : undefined,
        // Token metrics
        inputTokens: tokenUsage?.inputTokens,
        outputTokens: tokenUsage?.outputTokens,
        totalTokens: tokenUsage?.totalTokens,
        estimatedCostUsd,
      });

      return refinedFindings;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Log failed AI run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "refinement",
        provider: usedProvider,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
        details: { primaryProvider, fallbackProvider, primaryError: primaryError?.message },
      });

      // Final fallback to statistics
      try {
        console.log("[Refinement] Both AI providers failed, using statistics...");
        const fallbackFindings = refineWithStatistics(
          extractedData,
          researchResults
        );
        fallbackFindings.insights.unshift(
          "AI analysis unavailable, using statistical analysis"
        );

        await ctx.runMutation(internal.scans.updateRefinedFindingsInternal, {
          scanId: args.scanId,
          refinedFindings: fallbackFindings,
        });

        // Log stats fallback success
        await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
          scanId: args.scanId,
          stage: "refinement",
          provider: "stats",
          durationMs: Date.now() - startTime,
          success: true,
          details: { statsFallback: true, originalError: errorMessage },
        });

        return fallbackFindings;
      } catch {
        const userFriendlyError = formatUserError(error instanceof Error ? error : new Error(errorMessage));
        
        // Update scan status to failed
        await ctx.runMutation(internal.scans.updateStatusInternal, {
          scanId: args.scanId,
          status: "failed",
          errorMessage: userFriendlyError,
        });

        throw error;
      }
    }
  },
});
