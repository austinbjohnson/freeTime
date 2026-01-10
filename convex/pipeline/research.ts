"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ExtractedData, ResearchResults, Listing } from "./types";

/**
 * Stage 2: Web Research
 * Searches the web for information about the clothing item
 * 
 * Uses SerpAPI for web search, targets resale platforms
 */

// Build search queries from extracted data
function buildSearchQueries(data: ExtractedData): string[] {
  const queries: string[] = [];

  // Primary query: brand + style number
  if (data.brand && data.styleNumber) {
    queries.push(`"${data.brand}" "${data.styleNumber}"`);
    queries.push(`"${data.brand}" "${data.styleNumber}" resale`);
  }

  // SKU query
  if (data.brand && data.sku) {
    queries.push(`"${data.brand}" "${data.sku}"`);
  }

  // Brand + materials (for unique items)
  if (data.brand && data.materials?.length) {
    const material = data.materials[0].split(" ")[0]; // First word of first material
    queries.push(`"${data.brand}" ${material} clothing`);
  }

  // Fallback: just brand
  if (data.brand && queries.length === 0) {
    queries.push(`"${data.brand}" clothing resale value`);
  }

  // RN number lookup (US manufacturer database)
  if (data.rnNumber) {
    queries.push(`RN ${data.rnNumber} manufacturer`);
  }

  return queries.slice(0, 5); // Limit to 5 queries
}

// Search using SerpAPI
async function searchWithSerpAPI(query: string): Promise<{
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
  shopping?: Array<{
    title: string;
    price: string;
    link: string;
    source: string;
  }>;
}> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("SERPAPI_API_KEY not configured");

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: "google",
    num: "10",
  });

  const response = await fetch(`https://serpapi.com/search?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SerpAPI error: ${error}`);
  }

  return await response.json();
}

// Parse listings from search results
function parseListingsFromResults(
  results: Awaited<ReturnType<typeof searchWithSerpAPI>>
): Listing[] {
  const listings: Listing[] = [];

  // Parse shopping results
  if (results.shopping) {
    for (const item of results.shopping) {
      const priceMatch = item.price?.match(/[\d,.]+/);
      if (priceMatch) {
        listings.push({
          title: item.title,
          price: parseFloat(priceMatch[0].replace(/,/g, "")),
          currency: item.price.includes("$") ? "USD" : "USD",
          platform: item.source || "Google Shopping",
          url: item.link,
        });
      }
    }
  }

  // Parse organic results for known platforms
  const platforms = [
    { domain: "ebay.com", name: "eBay" },
    { domain: "poshmark.com", name: "Poshmark" },
    { domain: "mercari.com", name: "Mercari" },
    { domain: "therealreal.com", name: "TheRealReal" },
    { domain: "depop.com", name: "Depop" },
    { domain: "grailed.com", name: "Grailed" },
    { domain: "vestiairecollective.com", name: "Vestiaire Collective" },
  ];

  for (const item of results.organic || []) {
    const matchedPlatform = platforms.find((p) => item.link.includes(p.domain));
    if (matchedPlatform) {
      // Try to extract price from snippet
      const priceMatch = item.snippet?.match(/\$[\d,.]+/);
      listings.push({
        title: item.title,
        price: priceMatch
          ? parseFloat(priceMatch[0].replace(/[$,]/g, ""))
          : 0,
        currency: "USD",
        platform: matchedPlatform.name,
        url: item.link,
      });
    }
  }

  return listings;
}

// Main research action
export const researchItem = action({
  args: {
    scanId: v.id("scans"),
    extractedData: v.any(),
  },
  handler: async (ctx, args): Promise<ResearchResults> => {
    const startTime = Date.now();
    const extractedData = args.extractedData as ExtractedData;

    try {
      // Build search queries
      const queries = buildSearchQueries(extractedData);

      if (queries.length === 0) {
        throw new Error("Not enough data to build search queries");
      }

      // Execute searches
      const allListings: Listing[] = [];
      const sources: string[] = [];

      for (const query of queries.slice(0, 3)) {
        // Limit API calls
        try {
          const results = await searchWithSerpAPI(query);
          const listings = parseListingsFromResults(results);
          allListings.push(...listings);
          sources.push(
            ...(results.organic?.map((r) => r.link) || []).slice(0, 5)
          );

          // Small delay between requests
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (searchError) {
          console.error(`Search failed for query "${query}":`, searchError);
          // Continue with other queries
        }
      }

      // Deduplicate listings by URL
      const uniqueListings = Array.from(
        new Map(allListings.map((l) => [l.url, l])).values()
      );

      // Separate sold vs active (heuristic: check title/URL for "sold")
      const soldListings = uniqueListings.filter(
        (l) =>
          l.title.toLowerCase().includes("sold") ||
          l.url.toLowerCase().includes("sold")
      );
      const activeListings = uniqueListings.filter(
        (l) =>
          !l.title.toLowerCase().includes("sold") &&
          !l.url.toLowerCase().includes("sold")
      );

      const researchResults: ResearchResults = {
        listings: activeListings,
        soldListings,
        searchQueries: queries,
        sources: [...new Set(sources)].slice(0, 20),
        brandInfo: extractedData.brand
          ? {
              name: extractedData.brand,
            }
          : undefined,
      };

      // Update scan with research results
      await ctx.runMutation(internal.scans.updateResearchResultsInternal, {
        scanId: args.scanId,
        researchResults,
      });

      // Log successful run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "research",
        provider: "serpapi",
        durationMs: Date.now() - startTime,
        success: true,
      });

      return researchResults;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Log failed run
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "research",
        provider: "serpapi",
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      // Update scan status to failed
      await ctx.runMutation(internal.scans.updateStatusInternal, {
        scanId: args.scanId,
        status: "failed",
        errorMessage: `Research failed: ${errorMessage}`,
      });

      throw error;
    }
  },
});

