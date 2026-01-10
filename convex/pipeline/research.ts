"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ExtractedData, ResearchResults, Listing } from "./types";
import { withRetry, formatUserError } from "./utils";

/**
 * Stage 2: Web Research
 * Searches the web for information about the clothing item
 * 
 * Features:
 * - Platform-specific searches (eBay sold, Poshmark, Mercari, etc.)
 * - Brand tier-aware platform targeting
 * - AI-generated search suggestions prioritized
 * - Retry logic with exponential backoff
 */

// Resale platforms with search patterns
const RESALE_PLATFORMS = {
  // Best for sold data (completed listings)
  ebay: {
    domain: "ebay.com",
    name: "eBay",
    soldUrlPattern: "/sch/i.html?_nkw=",
    soldSuffix: "&LH_Complete=1&LH_Sold=1",
  },
  // Fashion-focused platforms
  poshmark: { domain: "poshmark.com", name: "Poshmark" },
  mercari: { domain: "mercari.com", name: "Mercari" },
  depop: { domain: "depop.com", name: "Depop" },
  grailed: { domain: "grailed.com", name: "Grailed" },
  // Luxury-focused platforms
  therealreal: { domain: "therealreal.com", name: "TheRealReal" },
  vestiaire: { domain: "vestiairecollective.com", name: "Vestiaire Collective" },
  rebag: { domain: "rebag.com", name: "Rebag" },
  // Vintage-focused
  etsy: { domain: "etsy.com", name: "Etsy" },
  // General
  thredup: { domain: "thredup.com", name: "ThredUp" },
};

// Platform recommendations by brand tier
const PLATFORM_TIERS: Record<string, string[]> = {
  luxury: ["therealreal", "vestiaire", "rebag", "ebay", "poshmark"],
  premium: ["poshmark", "ebay", "mercari", "grailed", "therealreal"],
  "mid-range": ["poshmark", "mercari", "ebay", "depop", "thredup"],
  budget: ["mercari", "thredup", "depop", "ebay"],
  vintage: ["etsy", "ebay", "depop", "poshmark", "grailed"],
  unknown: ["ebay", "poshmark", "mercari"],
};

// Build search queries optimized for resale platforms
function buildSearchQueries(data: ExtractedData): {
  general: string[];
  platformSpecific: Array<{ query: string; platform: string; site: string }>;
} {
  const general: string[] = [];
  const platformSpecific: Array<{ query: string; platform: string; site: string }> = [];

  // Determine brand tier for platform targeting
  const brandTier = (data as Record<string, unknown>).brandTier as string || "unknown";
  const targetPlatforms = PLATFORM_TIERS[brandTier] || PLATFORM_TIERS.unknown;

  // Build the core search term
  let coreSearchTerm = "";
  
  if (data.brand) {
    coreSearchTerm = data.brand;
    if (data.styleNumber) {
      coreSearchTerm += ` ${data.styleNumber}`;
    } else if (data.garmentAnalysis?.category) {
      coreSearchTerm += ` ${data.garmentAnalysis.category}`;
    }
  } else if (data.garmentAnalysis) {
    const g = data.garmentAnalysis;
    coreSearchTerm = [g.style, g.category, g.estimatedBrand].filter(Boolean).join(" ");
  }

  // PRIORITY 1: AI-generated search suggestions (already optimized)
  if (data.searchSuggestions?.length) {
    general.push(...data.searchSuggestions.slice(0, 2));
  }

  // PRIORITY 2: Platform-specific searches with site: operator
  if (coreSearchTerm) {
    // Always target eBay sold listings first (best pricing data)
    platformSpecific.push({
      query: `${coreSearchTerm} site:ebay.com`,
      platform: "eBay",
      site: "ebay.com",
    });

    // Target top platforms for this brand tier
    for (const platformKey of targetPlatforms.slice(0, 3)) {
      const platform = RESALE_PLATFORMS[platformKey as keyof typeof RESALE_PLATFORMS];
      if (platform && platformKey !== "ebay") {
        platformSpecific.push({
          query: `${coreSearchTerm} site:${platform.domain}`,
          platform: platform.name,
          site: platform.domain,
        });
      }
    }
  }

  // PRIORITY 3: Specific data points
  if (data.brand && data.sku) {
    general.push(`"${data.brand}" "${data.sku}"`);
  }

  if (data.rnNumber) {
    general.push(`RN ${data.rnNumber} manufacturer clothing`);
  }

  // PRIORITY 4: Garment-based queries (when no tag data)
  const garment = data.garmentAnalysis;
  if (garment && !data.brand) {
    if (garment.style && garment.category) {
      general.push(`${garment.style} ${garment.category} vintage resale`);
    }
    if (garment.estimatedOrigin) {
      general.push(`${garment.estimatedOrigin} ${garment.category || "sweater"} handmade`);
    }
    if (garment.notableFeatures?.length) {
      general.push(`${garment.notableFeatures[0]} ${garment.category || "clothing"} vintage`);
    }
  }

  return {
    general: [...new Set(general)].slice(0, 3),
    platformSpecific: platformSpecific.slice(0, 4),
  };
}

// Search using SerpAPI with retry
async function searchWithSerpAPI(
  query: string, 
  options?: { num?: number }
): Promise<{
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    price?: { extracted?: number; currency?: string };
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

  return withRetry(async () => {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: "google",
      num: String(options?.num || 15),
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SerpAPI error (${response.status}): ${error}`);
    }

    return await response.json();
  }, { maxRetries: 2, baseDelayMs: 2000 });
}

// Search eBay directly for sold listings (most valuable pricing data)
async function searchEbaySold(query: string): Promise<Listing[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: "ebay",
      ebay_domain: "ebay.com",
      _nkw: query,
      LH_Complete: "1",
      LH_Sold: "1",
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    const listings: Listing[] = [];

    for (const item of data.organic_results || []) {
      const price = item.price?.extracted || item.price?.raw;
      if (price) {
        listings.push({
          title: item.title,
          price: typeof price === "number" ? price : parseFloat(String(price).replace(/[$,]/g, "")),
          currency: "USD",
          platform: "eBay (Sold)",
          url: item.link,
          soldDate: item.sold_date,
          condition: item.condition,
        });
      }
    }

    return listings;
  } catch (error) {
    console.error("[Research] eBay sold search failed:", error);
    return [];
  }
}

// Parse listings from search results with improved price extraction
function parseListingsFromResults(
  results: Awaited<ReturnType<typeof searchWithSerpAPI>>,
  targetPlatform?: string
): Listing[] {
  const listings: Listing[] = [];

  // Parse shopping results first (more reliable pricing)
  if (results.shopping) {
    for (const item of results.shopping) {
      const priceMatch = item.price?.match(/[\d,.]+/);
      if (priceMatch) {
        listings.push({
          title: item.title,
          price: parseFloat(priceMatch[0].replace(/,/g, "")),
          currency: "USD",
          platform: item.source || "Google Shopping",
          url: item.link,
        });
      }
    }
  }

  // Parse organic results
  const allPlatforms = Object.values(RESALE_PLATFORMS);
  
  for (const item of results.organic || []) {
    // Match against known platforms
    const matchedPlatform = allPlatforms.find((p) => item.link.includes(p.domain));
    
    // If we're targeting a specific platform, only include matches
    if (targetPlatform && matchedPlatform?.name !== targetPlatform) {
      continue;
    }
    
    if (matchedPlatform || targetPlatform) {
      // Extract price from title, snippet, or structured data
      let price = 0;
      
      // Try structured price first
      if (item.price?.extracted) {
        price = item.price.extracted;
      } else {
        // Fall back to regex on title/snippet
        const priceMatch = (item.title + " " + (item.snippet || "")).match(/\$[\d,.]+/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0].replace(/[$,]/g, ""));
        }
      }

      // Detect if it's a sold listing
      const isSold = item.title.toLowerCase().includes("sold") || 
                     item.link.toLowerCase().includes("sold") ||
                     item.link.includes("LH_Sold=1");

      listings.push({
        title: item.title,
        price,
        currency: "USD",
        platform: matchedPlatform?.name || targetPlatform || "Unknown",
        url: item.link,
        condition: extractCondition(item.title + " " + (item.snippet || "")),
        soldDate: isSold ? "sold" : undefined,
      });
    }
  }

  return listings;
}

// Extract condition from text
function extractCondition(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("nwt") || lower.includes("new with tags")) return "New with tags";
  if (lower.includes("nwot") || lower.includes("new without tags")) return "New without tags";
  if (lower.includes("excellent")) return "Excellent";
  if (lower.includes("good condition") || lower.includes("great condition")) return "Good";
  if (lower.includes("fair")) return "Fair";
  if (lower.includes("pre-owned") || lower.includes("preowned")) return "Pre-owned";
  return undefined;
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
      // Build optimized search queries
      const { general, platformSpecific } = buildSearchQueries(extractedData);
      const allQueries = [...general, ...platformSpecific.map(p => p.query)];

      if (allQueries.length === 0) {
        throw new Error("Not enough data to build search queries");
      }

      console.log(`[Research] Running ${platformSpecific.length} platform-specific + ${general.length} general queries`);

      const allListings: Listing[] = [];
      const soldListings: Listing[] = [];
      const sources: string[] = [];

      // STEP 1: Direct eBay sold listings search (most valuable)
      const coreSearchTerm = extractedData.brand || 
        extractedData.garmentAnalysis?.style || 
        extractedData.searchSuggestions?.[0] || "";
      
      if (coreSearchTerm) {
        console.log(`[Research] Searching eBay sold listings for: ${coreSearchTerm}`);
        const ebaySold = await searchEbaySold(coreSearchTerm);
        soldListings.push(...ebaySold);
        console.log(`[Research] Found ${ebaySold.length} eBay sold listings`);
      }

      // STEP 2: Platform-specific searches
      for (const { query, platform, site } of platformSpecific) {
        try {
          console.log(`[Research] Searching ${platform}: ${query}`);
          const results = await searchWithSerpAPI(query, { num: 10 });
          const listings = parseListingsFromResults(results, platform);
          
          // Separate sold vs active
          for (const listing of listings) {
            if (listing.soldDate) {
              soldListings.push(listing);
            } else {
              allListings.push(listing);
            }
          }
          
          sources.push(...(results.organic?.map((r) => r.link) || []).slice(0, 3));
          
          // Rate limit protection
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (searchError) {
          console.error(`[Research] Platform search failed for ${platform}:`, searchError);
        }
      }

      // STEP 3: General searches (backup)
      for (const query of general.slice(0, 2)) {
        try {
          const results = await searchWithSerpAPI(query);
          const listings = parseListingsFromResults(results);
          
          for (const listing of listings) {
            if (listing.soldDate) {
              soldListings.push(listing);
            } else {
              allListings.push(listing);
            }
          }
          
          sources.push(...(results.organic?.map((r) => r.link) || []).slice(0, 3));
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (searchError) {
          console.error(`[Research] General search failed:`, searchError);
        }
      }

      // Deduplicate by URL
      const uniqueActive = Array.from(
        new Map(allListings.map((l) => [l.url, l])).values()
      );
      const uniqueSold = Array.from(
        new Map(soldListings.map((l) => [l.url, l])).values()
      );

      // Sort by price (highest first for active, recent for sold)
      uniqueActive.sort((a, b) => (b.price || 0) - (a.price || 0));
      uniqueSold.sort((a, b) => (b.price || 0) - (a.price || 0));

      const researchResults: ResearchResults = {
        listings: uniqueActive,
        soldListings: uniqueSold,
        searchQueries: allQueries,
        sources: [...new Set(sources)].slice(0, 25),
        brandInfo: extractedData.brand
          ? {
              name: extractedData.brand,
              priceRange: (extractedData as Record<string, unknown>).brandTier as string,
            }
          : undefined,
      };

      console.log(`[Research] Complete: ${uniqueActive.length} active, ${uniqueSold.length} sold listings`);

      // Update scan with research results
      await ctx.runMutation(internal.scans.updateResearchResultsInternal, {
        scanId: args.scanId,
        researchResults,
      });

      // Log successful run with details
      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "research",
        provider: "serpapi",
        durationMs: Date.now() - startTime,
        success: true,
        details: {
          activeListings: uniqueActive.length,
          soldListings: uniqueSold.length,
          queriesRun: allQueries.length,
        },
      });

      return researchResults;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const userFriendlyError = formatUserError(error instanceof Error ? error : new Error(errorMessage));

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
        errorMessage: userFriendlyError,
      });

      throw error;
    }
  },
});
