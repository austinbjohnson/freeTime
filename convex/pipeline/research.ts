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
 * - RELEVANCE FILTERING to exclude wrong products
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

// Product categories and their related terms (for filtering)
const PRODUCT_CATEGORIES: Record<string, { terms: string[]; excludeTerms: string[] }> = {
  fleece: {
    terms: ["fleece", "synchilla", "better sweater", "r1", "r2"],
    excludeTerms: ["down", "nano puff", "torrentshell", "rain", "shell"],
  },
  "down jacket": {
    terms: ["down", "down sweater", "800 fill", "goose down"],
    excludeTerms: ["fleece", "synchilla", "rain", "shell"],
  },
  "puffer": {
    terms: ["nano puff", "micro puff", "puffer", "insulated", "primaloft"],
    excludeTerms: ["fleece", "synchilla", "down sweater"],
  },
  "rain jacket": {
    terms: ["torrentshell", "rain", "waterproof", "h2no", "shell"],
    excludeTerms: ["fleece", "down", "puffer", "insulated"],
  },
  "sweater": {
    terms: ["sweater", "knit", "wool", "pullover", "cardigan"],
    excludeTerms: ["fleece", "down", "puffer", "rain"],
  },
  "jacket": {
    terms: ["jacket", "coat", "outerwear"],
    excludeTerms: [],
  },
  "pants": {
    terms: ["pants", "trousers", "jeans", "shorts"],
    excludeTerms: ["jacket", "shirt", "sweater"],
  },
  "shirt": {
    terms: ["shirt", "tee", "t-shirt", "button", "polo"],
    excludeTerms: ["jacket", "pants", "sweater"],
  },
};

/**
 * Detect product category from extracted data
 */
function detectProductCategory(data: ExtractedData): string | null {
  const searchText = [
    data.garmentAnalysis?.category,
    data.garmentAnalysis?.style,
    ...(data.searchSuggestions || []),
    ...(data.rawText || []),
  ].join(" ").toLowerCase();

  // Check for specific categories
  for (const [category, { terms }] of Object.entries(PRODUCT_CATEGORIES)) {
    for (const term of terms) {
      if (searchText.includes(term.toLowerCase())) {
        return category;
      }
    }
  }

  // Fall back to garment category if available
  return data.garmentAnalysis?.category?.toLowerCase() || null;
}

/**
 * Calculate relevance score for a listing against extracted data
 * Returns 0-1 where 1 is perfect match
 */
function calculateRelevanceScore(
  listing: Listing,
  extractedData: ExtractedData,
  productCategory: string | null
): number {
  const listingText = listing.title.toLowerCase();
  let score = 0;
  let maxScore = 0;

  // 1. Brand match (important)
  maxScore += 30;
  if (extractedData.brand) {
    const brandLower = extractedData.brand.toLowerCase();
    if (listingText.includes(brandLower)) {
      score += 30;
    }
  } else {
    score += 15; // No brand to match, give partial credit
  }

  // 2. Style number match (very important if available)
  if (extractedData.styleNumber) {
    maxScore += 40;
    const styleClean = extractedData.styleNumber.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const listingClean = listing.title.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (listingClean.includes(styleClean)) {
      score += 40;
    } else if (styleClean.length > 4 && listingClean.includes(styleClean.slice(0, 4))) {
      score += 20; // Partial style match
    }
  }

  // 3. Category match (important)
  maxScore += 30;
  if (productCategory) {
    const categoryConfig = PRODUCT_CATEGORIES[productCategory];
    if (categoryConfig) {
      // Check for matching terms
      const hasMatchingTerm = categoryConfig.terms.some(term => 
        listingText.includes(term.toLowerCase())
      );
      if (hasMatchingTerm) {
        score += 30;
      }

      // Penalize for excluded terms (wrong product type)
      const hasExcludedTerm = categoryConfig.excludeTerms.some(term =>
        listingText.includes(term.toLowerCase())
      );
      if (hasExcludedTerm) {
        score -= 25; // Heavy penalty for wrong product type
      }
    } else {
      // Check generic category match
      if (listingText.includes(productCategory)) {
        score += 20;
      }
    }
  } else {
    score += 10; // No category to match
  }

  // 4. Era/vintage match
  if (extractedData.garmentAnalysis?.estimatedEra) {
    maxScore += 10;
    const era = extractedData.garmentAnalysis.estimatedEra.toLowerCase();
    if (era.includes("vintage") && listingText.includes("vintage")) {
      score += 10;
    } else if (era.includes("90s") && (listingText.includes("90s") || listingText.includes("1990"))) {
      score += 10;
    } else if (era.includes("80s") && (listingText.includes("80s") || listingText.includes("1980"))) {
      score += 10;
    }
  }

  // 5. Size match (bonus if we know size)
  if (extractedData.size && extractedData.size.length > 0) {
    maxScore += 10;
    const size = extractedData.size.toLowerCase();
    // Common size patterns
    const sizePatterns = [
      size,
      `size ${size}`,
      `sz ${size}`,
      size === "s" ? "small" : size === "m" ? "medium" : size === "l" ? "large" : size === "xl" ? "extra large" : size,
    ];
    if (sizePatterns.some(p => listingText.includes(p))) {
      score += 10;
    }
  }

  // Normalize to 0-1
  const normalizedScore = maxScore > 0 ? Math.max(0, score) / maxScore : 0.5;
  return normalizedScore;
}

/**
 * Filter listings by relevance and return only good matches
 */
function filterByRelevance(
  listings: Listing[],
  extractedData: ExtractedData,
  productCategory: string | null,
  minRelevance: number = 0.4
): { relevant: Listing[]; filtered: number } {
  const scoredListings = listings.map(listing => ({
    listing,
    relevance: calculateRelevanceScore(listing, extractedData, productCategory),
  }));

  // Log some examples for debugging
  const topListings = scoredListings.slice(0, 5);
  console.log(`[Research] Relevance scoring examples:`);
  for (const { listing, relevance } of topListings) {
    console.log(`  - ${relevance.toFixed(2)}: ${listing.title.slice(0, 60)}...`);
  }

  const relevant = scoredListings
    .filter(({ relevance }) => relevance >= minRelevance)
    .sort((a, b) => b.relevance - a.relevance)
    .map(({ listing, relevance }) => ({
      ...listing,
      relevanceScore: relevance,
    }));

  return {
    relevant,
    filtered: listings.length - relevant.length,
  };
}

// Build search queries optimized for resale platforms
function buildSearchQueries(data: ExtractedData, productCategory: string | null): {
  general: string[];
  platformSpecific: Array<{ query: string; platform: string; site: string }>;
  ebayQuery: string;
} {
  const general: string[] = [];
  const platformSpecific: Array<{ query: string; platform: string; site: string }> = [];

  // Determine brand tier for platform targeting
  const brandTier = (data as Record<string, unknown>).brandTier as string || "unknown";
  const targetPlatforms = PLATFORM_TIERS[brandTier] || PLATFORM_TIERS.unknown;

  // Build the core search term with CATEGORY included
  let coreSearchTerm = "";
  let ebayQuery = "";
  
  if (data.brand) {
    coreSearchTerm = data.brand;
    
    // Add style number if available (most specific)
    if (data.styleNumber) {
      coreSearchTerm += ` ${data.styleNumber}`;
      ebayQuery = `${data.brand} ${data.styleNumber}`;
    } 
    // Otherwise add category (crucial for relevance!)
    else if (productCategory) {
      coreSearchTerm += ` ${productCategory}`;
      ebayQuery = `${data.brand} ${productCategory}`;
    }
    // Fall back to garment category
    else if (data.garmentAnalysis?.category) {
      coreSearchTerm += ` ${data.garmentAnalysis.category}`;
      ebayQuery = `${data.brand} ${data.garmentAnalysis.category}`;
    } else {
      ebayQuery = data.brand;
    }
  } else if (data.garmentAnalysis) {
    const g = data.garmentAnalysis;
    coreSearchTerm = [g.style, g.category, g.estimatedBrand].filter(Boolean).join(" ");
    ebayQuery = coreSearchTerm;
  }

  // Add exclusions to eBay query if we know the category
  if (productCategory && PRODUCT_CATEGORIES[productCategory]) {
    const excludes = PRODUCT_CATEGORIES[productCategory].excludeTerms;
    if (excludes.length > 0) {
      // eBay uses -term for exclusions
      ebayQuery += " " + excludes.slice(0, 3).map(t => `-${t}`).join(" ");
    }
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
    ebayQuery,
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
    console.log(`[Research] eBay query: ${query}`);
    
    const params = new URLSearchParams({
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

// Search eBay with multiple query strategies (specific → broad)
async function searchEbaySoldWithFallback(
  queries: string[],
  extractedData: ExtractedData,
  productCategory: string | null
): Promise<Listing[]> {
  const allListings: Listing[] = [];
  
  for (const query of queries) {
    console.log(`[Research] Trying eBay query: ${query}`);
    const results = await searchEbaySold(query);
    console.log(`[Research] Found ${results.length} results`);
    
    if (results.length > 0) {
      // Filter by relevance
      const { relevant, filtered } = filterByRelevance(results, extractedData, productCategory, 0.3);
      console.log(`[Research] After relevance filter: ${relevant.length} kept, ${filtered} removed`);
      
      if (relevant.length >= 5) {
        // Got enough relevant results, use these
        return relevant;
      }
      
      // Add what we have and try next query
      allListings.push(...relevant);
    }
  }
  
  return allListings;
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
      // Detect product category for better filtering
      const productCategory = detectProductCategory(extractedData);
      console.log(`[Research] Detected product category: ${productCategory || "unknown"}`);

      // Build optimized search queries WITH category
      const { general, platformSpecific, ebayQuery } = buildSearchQueries(extractedData, productCategory);
      const allQueries = [...general, ...platformSpecific.map(p => p.query)];

      if (allQueries.length === 0) {
        throw new Error("Not enough data to build search queries");
      }

      console.log(`[Research] Running ${platformSpecific.length} platform-specific + ${general.length} general queries`);

      const allListings: Listing[] = [];
      const soldListings: Listing[] = [];
      const sources: string[] = [];

      // STEP 1: Direct eBay sold listings search with FALLBACK strategy
      // Try specific queries first, then broaden if needed
      const ebayQueries: string[] = [];
      
      // Most specific: Brand + Style Number
      if (extractedData.brand && extractedData.styleNumber) {
        ebayQueries.push(`${extractedData.brand} ${extractedData.styleNumber}`);
      }
      
      // Medium specific: Brand + Category + Exclusions
      if (ebayQuery) {
        ebayQueries.push(ebayQuery);
      }
      
      // Broader: Brand + Category (no exclusions)
      if (extractedData.brand && productCategory) {
        ebayQueries.push(`${extractedData.brand} ${productCategory}`);
      }
      
      // Broadest: Just brand (rely on relevance filtering)
      if (extractedData.brand) {
        ebayQueries.push(extractedData.brand);
      }
      
      // Remove duplicates
      const uniqueEbayQueries = [...new Set(ebayQueries)];
      
      if (uniqueEbayQueries.length > 0) {
        console.log(`[Research] eBay query strategy: ${uniqueEbayQueries.length} queries (specific → broad)`);
        const ebaySold = await searchEbaySoldWithFallback(uniqueEbayQueries, extractedData, productCategory);
        soldListings.push(...ebaySold);
        console.log(`[Research] Final eBay results: ${ebaySold.length} relevant sold listings`);
      }

      // STEP 2: Platform-specific searches
      for (const { query, platform, site } of platformSpecific) {
        try {
          console.log(`[Research] Searching ${platform}: ${query}`);
          const results = await searchWithSerpAPI(query, { num: 10 });
          const listings = parseListingsFromResults(results, platform);
          
          // Filter by relevance
          const { relevant } = filterByRelevance(listings, extractedData, productCategory, 0.35);
          
          // Separate sold vs active
          for (const listing of relevant) {
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
          
          // Filter by relevance
          const { relevant } = filterByRelevance(listings, extractedData, productCategory, 0.35);
          
          for (const listing of relevant) {
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

      // Sort by relevance score first, then price
      uniqueActive.sort((a, b) => {
        const relDiff = ((b as any).relevanceScore || 0) - ((a as any).relevanceScore || 0);
        return relDiff !== 0 ? relDiff : (b.price || 0) - (a.price || 0);
      });
      uniqueSold.sort((a, b) => {
        const relDiff = ((b as any).relevanceScore || 0) - ((a as any).relevanceScore || 0);
        return relDiff !== 0 ? relDiff : (b.price || 0) - (a.price || 0);
      });

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

      console.log(`[Research] Complete: ${uniqueActive.length} active, ${uniqueSold.length} sold listings (relevance filtered)`);

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
          productCategory,
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
