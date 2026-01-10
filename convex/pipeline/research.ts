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
 * - RELEVANCE FILTERING with scoring and minimum threshold
 * - Retry logic with exponential backoff
 */

// Minimum relevance score to include a listing (0-1 scale)
// 0.45 = brand + category matches pass, but wrong category (down/puffer) filtered
// Exact style matches score ~1.0, same category ~0.47, wrong category ~0.0
const MIN_RELEVANCE_THRESHOLD = 0.45;

// Resale platforms with search patterns
const RESALE_PLATFORMS = {
  ebay: { domain: "ebay.com", name: "eBay" },
  poshmark: { domain: "poshmark.com", name: "Poshmark" },
  mercari: { domain: "mercari.com", name: "Mercari" },
  depop: { domain: "depop.com", name: "Depop" },
  grailed: { domain: "grailed.com", name: "Grailed" },
  therealreal: { domain: "therealreal.com", name: "TheRealReal" },
  vestiaire: { domain: "vestiairecollective.com", name: "Vestiaire Collective" },
  rebag: { domain: "rebag.com", name: "Rebag" },
  etsy: { domain: "etsy.com", name: "Etsy" },
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

// Comprehensive product categories with match/exclude terms
const PRODUCT_CATEGORIES: Record<string, { 
  terms: string[]; 
  excludeTerms: string[];
  relatedCategories?: string[];  // Similar enough to not penalize
}> = {
  // Outerwear - Fleece
  fleece: {
    terms: ["fleece", "synchilla", "better sweater", "retool", "r1", "r2", "snap-t", "snap t"],
    excludeTerms: ["down", "nano puff", "micro puff", "torrentshell", "rain", "shell", "puffer"],
    relatedCategories: ["sweater", "pullover"],
  },
  // Outerwear - Down/Insulated
  "down jacket": {
    terms: ["down", "down sweater", "800 fill", "700 fill", "600 fill", "goose down", "duck down"],
    excludeTerms: ["fleece", "synchilla", "rain", "shell", "snap-t"],
    relatedCategories: ["puffer", "jacket"],
  },
  puffer: {
    terms: ["nano puff", "micro puff", "puffer", "primaloft", "thermoball", "insulated"],
    excludeTerms: ["fleece", "synchilla", "down sweater", "rain"],
    relatedCategories: ["down jacket", "jacket"],
  },
  // Outerwear - Shell/Rain
  "rain jacket": {
    terms: ["torrentshell", "rain", "waterproof", "h2no", "shell", "gore-tex", "windbreaker"],
    excludeTerms: ["fleece", "down", "puffer", "insulated", "sweater"],
    relatedCategories: ["jacket"],
  },
  // Outerwear - General
  jacket: {
    terms: ["jacket", "coat", "bomber", "trucker", "denim jacket"],
    excludeTerms: [],
    relatedCategories: [],
  },
  vest: {
    terms: ["vest", "gilet"],
    excludeTerms: ["jacket", "coat", "pants", "shirt"],
    relatedCategories: [],
  },
  // Tops
  sweater: {
    terms: ["sweater", "knit", "wool sweater", "pullover", "cardigan", "crewneck"],
    excludeTerms: ["fleece", "down", "puffer", "rain", "jacket"],
    relatedCategories: ["fleece"],
  },
  hoodie: {
    terms: ["hoodie", "hoody", "hooded sweatshirt", "zip hoodie"],
    excludeTerms: ["jacket", "coat"],
    relatedCategories: ["sweatshirt"],
  },
  sweatshirt: {
    terms: ["sweatshirt", "crew neck", "crewneck sweatshirt"],
    excludeTerms: ["jacket", "hoodie"],
    relatedCategories: ["hoodie"],
  },
  shirt: {
    terms: ["shirt", "button up", "button down", "oxford", "flannel shirt", "dress shirt"],
    excludeTerms: ["jacket", "pants", "sweater", "t-shirt", "tee"],
    relatedCategories: [],
  },
  "t-shirt": {
    terms: ["t-shirt", "tee", "tshirt", "graphic tee", "pocket tee"],
    excludeTerms: ["jacket", "pants", "sweater", "button"],
    relatedCategories: [],
  },
  polo: {
    terms: ["polo", "polo shirt", "golf shirt"],
    excludeTerms: ["jacket", "pants", "sweater"],
    relatedCategories: ["shirt"],
  },
  // Bottoms
  pants: {
    terms: ["pants", "trousers", "chinos", "khakis", "slacks"],
    excludeTerms: ["jacket", "shirt", "sweater", "shorts", "jeans"],
    relatedCategories: [],
  },
  jeans: {
    terms: ["jeans", "denim", "501", "levi"],
    excludeTerms: ["jacket", "shirt", "shorts"],
    relatedCategories: ["pants"],
  },
  shorts: {
    terms: ["shorts", "baggies", "stand up shorts"],
    excludeTerms: ["jacket", "shirt", "pants", "jeans"],
    relatedCategories: [],
  },
  // Dresses/Skirts
  dress: {
    terms: ["dress", "maxi", "midi", "mini dress"],
    excludeTerms: ["jacket", "pants", "shirt"],
    relatedCategories: [],
  },
  skirt: {
    terms: ["skirt"],
    excludeTerms: ["jacket", "pants", "shirt", "dress"],
    relatedCategories: [],
  },
};

// Gender indicators for matching
const GENDER_INDICATORS = {
  mens: ["men's", "mens", "male", "guy", "man's"],
  womens: ["women's", "womens", "female", "lady", "woman's", "ladies"],
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

  // Check for specific categories (order matters - more specific first)
  const categoryPriority = [
    "fleece", "down jacket", "puffer", "rain jacket", "vest",
    "hoodie", "sweatshirt", "sweater", "polo", "t-shirt", "shirt",
    "jeans", "shorts", "pants", "dress", "skirt", "jacket"
  ];

  for (const category of categoryPriority) {
    const config = PRODUCT_CATEGORIES[category];
    if (config) {
      for (const term of config.terms) {
        if (searchText.includes(term.toLowerCase())) {
          return category;
        }
      }
    }
  }

  // Fall back to garment category if available
  return data.garmentAnalysis?.category?.toLowerCase() || null;
}

/**
 * Infer category from a high-confidence exact match listing
 * Used when extraction didn't provide category but we found an exact style match
 */
function inferCategoryFromListing(listingTitle: string): string | null {
  const title = listingTitle.toLowerCase();
  
  // Check categories in priority order
  const categoryPriority = [
    "fleece", "down jacket", "puffer", "rain jacket", "vest",
    "hoodie", "sweatshirt", "sweater", "polo", "t-shirt", "shirt",
    "jeans", "shorts", "pants", "dress", "skirt", "jacket"
  ];

  for (const category of categoryPriority) {
    const config = PRODUCT_CATEGORIES[category];
    if (config) {
      for (const term of config.terms) {
        if (title.includes(term.toLowerCase())) {
          return category;
        }
      }
    }
  }
  
  return null;
}

/**
 * Detect gender from extracted data
 */
function detectGender(data: ExtractedData): "mens" | "womens" | null {
  const searchText = [
    data.garmentAnalysis?.category,
    data.garmentAnalysis?.style,
    ...(data.searchSuggestions || []),
    ...(data.rawText || []),
  ].join(" ").toLowerCase();

  for (const term of GENDER_INDICATORS.mens) {
    if (searchText.includes(term)) return "mens";
  }
  for (const term of GENDER_INDICATORS.womens) {
    if (searchText.includes(term)) return "womens";
  }
  return null;
}

/**
 * Calculate relevance score for a listing against extracted data
 * Returns 0-1 where 1 is perfect match
 * 
 * Scoring breakdown:
 * - Brand match: 25 points
 * - Style/Model number match: 35 points (most specific identifier)
 * - Category match: 25 points (or -30 penalty for wrong category)
 * - Gender match: 10 points (or -15 penalty for wrong gender)
 * - Size match: 5 points (bonus)
 */
function calculateRelevanceScore(
  listing: Listing,
  extractedData: ExtractedData,
  productCategory: string | null,
  gender: "mens" | "womens" | null
): { score: number; breakdown: string[] } {
  const listingText = listing.title.toLowerCase();
  const breakdown: string[] = [];
  let score = 0;
  let maxPossibleScore = 0;

  // 1. BRAND MATCH (25 points)
  maxPossibleScore += 25;
  if (extractedData.brand) {
    const brandLower = extractedData.brand.toLowerCase();
    // Check for brand name in listing
    if (listingText.includes(brandLower)) {
      score += 25;
      breakdown.push(`+25 brand match`);
    } else {
      breakdown.push(`+0 brand mismatch`);
    }
  } else {
    // No brand to match - give partial credit
    score += 12;
    breakdown.push(`+12 no brand required`);
  }

  // 2. STYLE/MODEL NUMBER MATCH (35 points - most valuable)
  // When we have a style number, it's the best identifier - penalize if not found
  if (extractedData.styleNumber) {
    maxPossibleScore += 35;
    // Clean both strings for comparison (remove special chars)
    const styleClean = extractedData.styleNumber.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const listingClean = listing.title.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    
    if (styleClean.length >= 4) {
      if (listingClean.includes(styleClean)) {
        score += 35;
        breakdown.push(`+35 exact style match`);
      } else if (listingClean.includes(styleClean.slice(0, Math.min(6, styleClean.length)))) {
        // Partial match (first 6 chars)
        score += 20;
        breakdown.push(`+20 partial style match`);
      } else {
        // PENALTY: We have a specific style number but listing doesn't match
        // This makes exact matches stand out much more
        score -= 10;
        breakdown.push(`-10 style not found (we have ${extractedData.styleNumber})`);
      }
    }
  }

  // 3. CATEGORY MATCH (25 points or -30 penalty)
  maxPossibleScore += 25;
  if (productCategory) {
    const categoryConfig = PRODUCT_CATEGORIES[productCategory];
    if (categoryConfig) {
      // Check for matching terms (positive)
      const hasMatchingTerm = categoryConfig.terms.some(term => 
        listingText.includes(term.toLowerCase())
      );
      
      // Check for excluded terms (negative - WRONG product)
      const hasExcludedTerm = categoryConfig.excludeTerms.some(term =>
        listingText.includes(term.toLowerCase())
      );
      
      // Check for related categories (acceptable, partial credit)
      const hasRelatedCategory = categoryConfig.relatedCategories?.some(related => {
        const relatedConfig = PRODUCT_CATEGORIES[related];
        return relatedConfig?.terms.some(term => listingText.includes(term.toLowerCase()));
      });

      if (hasExcludedTerm) {
        // WRONG PRODUCT TYPE - heavy penalty
        score -= 30;
        breakdown.push(`-30 WRONG CATEGORY (excluded term found)`);
      } else if (hasMatchingTerm) {
        score += 25;
        breakdown.push(`+25 category match`);
      } else if (hasRelatedCategory) {
        score += 15;
        breakdown.push(`+15 related category`);
      } else {
        // No category signal - small penalty
        score += 5;
        breakdown.push(`+5 category unclear`);
      }
    } else {
      // Unknown category - check generic match
      if (listingText.includes(productCategory)) {
        score += 20;
        breakdown.push(`+20 generic category match`);
      } else {
        score += 5;
        breakdown.push(`+5 category unknown`);
      }
    }
  } else {
    // No category to match
    score += 10;
    breakdown.push(`+10 no category required`);
  }

  // 4. GENDER MATCH (10 points or -15 penalty)
  if (gender) {
    maxPossibleScore += 10;
    const genderTerms = GENDER_INDICATORS[gender];
    const oppositeGender = gender === "mens" ? "womens" : "mens";
    const oppositeTerms = GENDER_INDICATORS[oppositeGender];
    
    const hasCorrectGender = genderTerms.some(term => listingText.includes(term));
    const hasWrongGender = oppositeTerms.some(term => listingText.includes(term));
    
    if (hasWrongGender && !hasCorrectGender) {
      score -= 15;
      breakdown.push(`-15 WRONG GENDER`);
    } else if (hasCorrectGender) {
      score += 10;
      breakdown.push(`+10 gender match`);
    }
  }

  // 5. SIZE MATCH (5 bonus points)
  if (extractedData.size && extractedData.size.length > 0) {
    const size = extractedData.size.toLowerCase().trim();
    if (size) {
      maxPossibleScore += 5;
      const sizePatterns = [
        size,
        `size ${size}`,
        `sz ${size}`,
        // Map single letters to words
        size === "s" ? "small" : 
        size === "m" ? "medium" : 
        size === "l" ? "large" : 
        size === "xl" ? "extra large" : 
        size === "xxl" ? "2xl" : size,
      ];
      
      if (sizePatterns.some(p => listingText.includes(p))) {
        score += 5;
        breakdown.push(`+5 size match`);
      }
    }
  }

  // Normalize to 0-1 (but allow negative scores to pull below 0 before clamping)
  const normalizedScore = maxPossibleScore > 0 
    ? Math.max(0, Math.min(1, score / maxPossibleScore))
    : 0.5;

  return { score: normalizedScore, breakdown };
}

/**
 * Filter listings by relevance score
 * Returns only listings that meet the minimum threshold
 */
function filterByRelevance(
  listings: Listing[],
  extractedData: ExtractedData,
  productCategory: string | null,
  gender: "mens" | "womens" | null,
  threshold: number = MIN_RELEVANCE_THRESHOLD
): { relevant: Listing[]; filtered: number; examples: Array<{ title: string; score: number; breakdown: string[] }> } {
  const scoredListings = listings.map(listing => {
    const { score, breakdown } = calculateRelevanceScore(listing, extractedData, productCategory, gender);
    return { listing, score, breakdown };
  });

  // Collect examples for logging (mix of kept and filtered)
  const examples: Array<{ title: string; score: number; breakdown: string[] }> = [];
  
  // Sort by score descending
  scoredListings.sort((a, b) => b.score - a.score);
  
  // Take top 3 and bottom 3 for examples
  const topExamples = scoredListings.slice(0, 3);
  const bottomExamples = scoredListings.slice(-3);
  
  for (const { listing, score, breakdown } of [...topExamples, ...bottomExamples]) {
    if (examples.length < 6) {
      examples.push({
        title: listing.title.slice(0, 60),
        score,
        breakdown,
      });
    }
  }

  // Filter by threshold
  const relevant = scoredListings
    .filter(({ score }) => score >= threshold)
    .map(({ listing, score }) => ({
      ...listing,
      relevanceScore: score,
    }));

  return {
    relevant,
    filtered: listings.length - relevant.length,
    examples,
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

  const brandTier = (data as Record<string, unknown>).brandTier as string || "unknown";
  const targetPlatforms = PLATFORM_TIERS[brandTier] || PLATFORM_TIERS.unknown;

  let coreSearchTerm = "";
  let ebayQuery = "";
  
  if (data.brand) {
    coreSearchTerm = data.brand;
    
    if (data.styleNumber) {
      coreSearchTerm += ` ${data.styleNumber}`;
      ebayQuery = `${data.brand} ${data.styleNumber}`;
    } else if (productCategory) {
      coreSearchTerm += ` ${productCategory}`;
      ebayQuery = `${data.brand} ${productCategory}`;
    } else if (data.garmentAnalysis?.category) {
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

  // Add category exclusions to eBay query
  if (productCategory && PRODUCT_CATEGORIES[productCategory]) {
    const excludes = PRODUCT_CATEGORIES[productCategory].excludeTerms;
    if (excludes.length > 0) {
      ebayQuery += " " + excludes.slice(0, 3).map(t => `-"${t}"`).join(" ");
    }
  }

  // AI-generated search suggestions
  if (data.searchSuggestions?.length) {
    general.push(...data.searchSuggestions.slice(0, 2));
  }

  // Platform-specific searches
  if (coreSearchTerm) {
    platformSpecific.push({
      query: `${coreSearchTerm} site:ebay.com`,
      platform: "eBay",
      site: "ebay.com",
    });

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

  // Specific identifiers
  if (data.brand && data.sku) {
    general.push(`"${data.brand}" "${data.sku}"`);
  }

  if (data.rnNumber) {
    general.push(`RN ${data.rnNumber} manufacturer clothing`);
  }

  // Garment-based queries
  const garment = data.garmentAnalysis;
  if (garment && !data.brand) {
    if (garment.style && garment.category) {
      general.push(`${garment.style} ${garment.category} vintage resale`);
    }
    if (garment.estimatedOrigin) {
      general.push(`${garment.estimatedOrigin} ${garment.category || "sweater"} handmade`);
    }
  }

  return {
    general: [...new Set(general)].slice(0, 3),
    platformSpecific: platformSpecific.slice(0, 4),
    ebayQuery,
  };
}

// Search using SerpAPI
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

// Search eBay for sold listings
async function searchEbaySold(query: string): Promise<Listing[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [];

  try {
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

// Search eBay with fallback strategy (specific → broad)
// Also infers category from exact matches to improve filtering
async function searchEbaySoldWithFallback(
  queries: string[],
  extractedData: ExtractedData,
  productCategory: string | null,
  gender: "mens" | "womens" | null
): Promise<{ listings: Listing[]; queryUsed: string | null; inferredCategory: string | null }> {
  let inferredCategory = productCategory;
  
  for (const query of queries) {
    console.log(`[Research] eBay query: "${query}"`);
    const results = await searchEbaySold(query);
    console.log(`[Research] Raw results: ${results.length}`);
    
    if (results.length > 0) {
      // If we don't have a category yet, try to infer from exact style matches
      if (!inferredCategory && extractedData.styleNumber) {
        const styleClean = extractedData.styleNumber.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        for (const listing of results) {
          const listingClean = listing.title.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
          if (listingClean.includes(styleClean)) {
            // Found exact match - infer category from its title
            const inferred = inferCategoryFromListing(listing.title);
            if (inferred) {
              inferredCategory = inferred;
              console.log(`[Research] Inferred category from exact match: "${inferredCategory}"`);
              break;
            }
          }
        }
      }
      
      const { relevant, filtered, examples } = filterByRelevance(
        results, extractedData, inferredCategory, gender, MIN_RELEVANCE_THRESHOLD
      );
      
      // Log relevance examples
      console.log(`[Research] Relevance filtering (threshold: ${MIN_RELEVANCE_THRESHOLD}, category: ${inferredCategory || "unknown"}):`);
      for (const ex of examples.slice(0, 4)) {
        const status = ex.score >= MIN_RELEVANCE_THRESHOLD ? "✓ KEEP" : "✗ FILTER";
        console.log(`  ${status} [${ex.score.toFixed(2)}] ${ex.title}...`);
        console.log(`    → ${ex.breakdown.join(", ")}`);
      }
      console.log(`[Research] Result: ${relevant.length} kept, ${filtered} filtered`);
      
      if (relevant.length >= 5) {
        return { listings: relevant, queryUsed: query, inferredCategory };
      }
      
      // If some results, try next query but accumulate
      if (relevant.length > 0) {
        const nextQueryIndex = queries.indexOf(query) + 1;
        if (nextQueryIndex < queries.length) {
          const moreResults = await searchEbaySoldWithFallback(
            queries.slice(nextQueryIndex),
            extractedData,
            inferredCategory, // Pass inferred category to next iteration
            gender
          );
          const combined = [...relevant, ...moreResults.listings];
          const unique = Array.from(new Map(combined.map(l => [l.url, l])).values());
          return { listings: unique, queryUsed: query, inferredCategory: moreResults.inferredCategory || inferredCategory };
        }
        return { listings: relevant, queryUsed: query, inferredCategory };
      }
    }
  }
  
  return { listings: [], queryUsed: null, inferredCategory };
}

// Parse listings from search results
function parseListingsFromResults(
  results: Awaited<ReturnType<typeof searchWithSerpAPI>>,
  targetPlatform?: string
): Listing[] {
  const listings: Listing[] = [];

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

  const allPlatforms = Object.values(RESALE_PLATFORMS);
  
  for (const item of results.organic || []) {
    const matchedPlatform = allPlatforms.find((p) => item.link.includes(p.domain));
    
    if (targetPlatform && matchedPlatform?.name !== targetPlatform) {
      continue;
    }
    
    if (matchedPlatform || targetPlatform) {
      let price = 0;
      
      if (item.price?.extracted) {
        price = item.price.extracted;
      } else {
        const priceMatch = (item.title + " " + (item.snippet || "")).match(/\$[\d,.]+/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0].replace(/[$,]/g, ""));
        }
      }

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
      // Detect product context for filtering
      const productCategory = detectProductCategory(extractedData);
      const gender = detectGender(extractedData);
      
      console.log(`[Research] Context: category="${productCategory || "unknown"}", gender="${gender || "unknown"}"`);
      console.log(`[Research] Relevance threshold: ${MIN_RELEVANCE_THRESHOLD}`);

      // Build queries
      const { general, platformSpecific, ebayQuery } = buildSearchQueries(extractedData, productCategory);
      const allQueries = [...general, ...platformSpecific.map(p => p.query)];

      if (allQueries.length === 0) {
        throw new Error("Not enough data to build search queries");
      }

      const allListings: Listing[] = [];
      const soldListings: Listing[] = [];
      const sources: string[] = [];

      // STEP 1: eBay sold listings (most valuable pricing data)
      const ebayQueries: string[] = [];
      
      // Most specific → broadest
      if (extractedData.brand && extractedData.styleNumber) {
        ebayQueries.push(`${extractedData.brand} ${extractedData.styleNumber}`);
      }
      if (ebayQuery && !ebayQueries.includes(ebayQuery)) {
        ebayQueries.push(ebayQuery);
      }
      if (extractedData.brand && productCategory) {
        const broadQuery = `${extractedData.brand} ${productCategory}`;
        if (!ebayQueries.includes(broadQuery)) {
          ebayQueries.push(broadQuery);
        }
      }
      if (extractedData.brand && !ebayQueries.includes(extractedData.brand)) {
        ebayQueries.push(extractedData.brand);
      }
      
      // Track the effective category (may be inferred from exact matches)
      let effectiveCategory = productCategory;
      
      if (ebayQueries.length > 0) {
        console.log(`[Research] eBay strategy: ${ebayQueries.length} queries (specific → broad)`);
        const { listings: ebaySold, queryUsed, inferredCategory } = await searchEbaySoldWithFallback(
          ebayQueries, extractedData, productCategory, gender
        );
        soldListings.push(...ebaySold);
        
        // Update effective category if we inferred one
        if (inferredCategory && !productCategory) {
          effectiveCategory = inferredCategory;
          console.log(`[Research] Using inferred category: "${effectiveCategory}"`);
        }
        
        console.log(`[Research] eBay final: ${ebaySold.length} relevant sold listings${queryUsed ? ` (via "${queryUsed}")` : ""}`);
      }

      // STEP 2: Platform-specific searches (use effective category from eBay inference)
      for (const { query, platform } of platformSpecific) {
        try {
          console.log(`[Research] Searching ${platform}...`);
          const results = await searchWithSerpAPI(query, { num: 10 });
          const listings = parseListingsFromResults(results, platform);
          
          const { relevant, filtered } = filterByRelevance(
            listings, extractedData, effectiveCategory, gender, MIN_RELEVANCE_THRESHOLD
          );
          console.log(`[Research] ${platform}: ${relevant.length} kept, ${filtered} filtered`);
          
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
          console.error(`[Research] ${platform} failed:`, searchError);
        }
      }

      // STEP 3: General searches (use effective category)
      for (const query of general.slice(0, 2)) {
        try {
          const results = await searchWithSerpAPI(query);
          const listings = parseListingsFromResults(results);
          
          const { relevant } = filterByRelevance(
            listings, extractedData, effectiveCategory, gender, MIN_RELEVANCE_THRESHOLD
          );
          
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

      // Deduplicate
      const uniqueActive = Array.from(new Map(allListings.map((l) => [l.url, l])).values());
      const uniqueSold = Array.from(new Map(soldListings.map((l) => [l.url, l])).values());

      // Sort by relevance, then price
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

      console.log(`[Research] Complete: ${uniqueActive.length} active, ${uniqueSold.length} sold (all relevance filtered ≥${MIN_RELEVANCE_THRESHOLD})`);

      await ctx.runMutation(internal.scans.updateResearchResultsInternal, {
        scanId: args.scanId,
        researchResults,
      });

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
          detectedCategory: productCategory,
          effectiveCategory: effectiveCategory,
          gender,
          relevanceThreshold: MIN_RELEVANCE_THRESHOLD,
        },
      });

      return researchResults;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const userFriendlyError = formatUserError(error instanceof Error ? error : new Error(errorMessage));

      await ctx.runMutation(internal.pipeline.logging.logPipelineRun, {
        scanId: args.scanId,
        stage: "research",
        provider: "serpapi",
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      await ctx.runMutation(internal.scans.updateStatusInternal, {
        scanId: args.scanId,
        status: "failed",
        errorMessage: userFriendlyError,
      });

      throw error;
    }
  },
});
