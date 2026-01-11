import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Anonymized Scan Analytics
 * 
 * Collects anonymized scan data to build crowdsourced pricing intelligence.
 * Privacy-safe: No userId, imageStorageId, precise timestamps, or PII.
 */

// ============================================
// Types
// ============================================

interface AnonymizedScanData {
  contentHash: string;
  brand?: string;
  brandTier?: string;
  category?: string;
  style?: string;
  materials?: string[];
  countryOfOrigin?: string;
  estimatedEra?: string;
  conditionGrade?: string;
  priceLow?: number;
  priceHigh?: number;
  priceRecommended?: number;
  currency: string;
  marketActivity?: string;
  demandLevel?: string;
  activeListingsCount?: number;
  soldListingsCount?: number;
  confidence?: number;
  timeBucket: string;
}

// ============================================
// Privacy Utilities
// ============================================

/**
 * Simple hash function (djb2 algorithm) - no crypto dependency
 * Good enough for deduplication purposes
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Generate a content hash for deduplication
 * Based on brand + category + style (not unique to user)
 */
function generateContentHash(data: {
  brand?: string;
  category?: string;
  style?: string;
}): string {
  const content = [
    data.brand?.toLowerCase() || "",
    data.category?.toLowerCase() || "",
    data.style?.toLowerCase() || "",
  ].join("|");
  
  return simpleHash(content);
}

/**
 * Get current time bucket (YYYY-MM format for privacy)
 */
function getTimeBucket(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Extract anonymized data from a completed scan
 * Strips all PII and user-identifying information
 */
export function extractAnonymizedData(
  extractedData: Record<string, unknown>,
  refinedFindings: Record<string, unknown>,
  researchResults: Record<string, unknown>
): AnonymizedScanData {
  // Extract category from garment analysis or infer from extracted data
  const garmentAnalysis = extractedData.garmentAnalysis as Record<string, unknown> | undefined;
  const conditionAssessment = extractedData.conditionAssessment as Record<string, unknown> | undefined;
  const priceRange = refinedFindings.suggestedPriceRange as Record<string, unknown> | undefined;
  
  const brand = extractedData.brand as string | undefined;
  const category = garmentAnalysis?.category as string | undefined;
  const style = garmentAnalysis?.style as string | undefined;
  
  return {
    contentHash: generateContentHash({ brand, category, style }),
    
    // Item identification
    brand: brand?.toUpperCase(),
    brandTier: extractedData.brandTier as string | undefined,
    category,
    style,
    
    // Item attributes
    materials: extractedData.materials as string[] | undefined,
    countryOfOrigin: extractedData.countryOfOrigin as string | undefined,
    estimatedEra: garmentAnalysis?.estimatedEra as string | undefined,
    
    // Condition
    conditionGrade: conditionAssessment?.overallGrade as string | undefined,
    
    // Pricing (the gold!)
    priceLow: priceRange?.low as number | undefined,
    priceHigh: priceRange?.high as number | undefined,
    priceRecommended: priceRange?.recommended as number | undefined,
    currency: (priceRange?.currency as string) || "USD",
    
    // Market intelligence
    marketActivity: refinedFindings.marketActivity as string | undefined,
    demandLevel: refinedFindings.demandLevel as string | undefined,
    activeListingsCount: (researchResults.listings as unknown[])?.length,
    soldListingsCount: (researchResults.soldListings as unknown[])?.length,
    
    // Quality
    confidence: refinedFindings.confidence as number | undefined,
    
    // Privacy-safe time bucket
    timeBucket: getTimeBucket(),
  };
}

// ============================================
// Mutations
// ============================================

/**
 * Record anonymized scan data (called after pipeline completion)
 * Internal mutation - not exposed to clients
 */
export const recordScanAnalytics = internalMutation({
  args: {
    scanId: v.id("scans"),
  },
  handler: async (ctx, args) => {
    // Get the scan data
    const scan = await ctx.db.get(args.scanId);
    if (!scan) {
      console.log("[Analytics] Scan not found:", args.scanId);
      return null;
    }
    
    // Check if scan completed successfully
    if (scan.status !== "completed") {
      console.log("[Analytics] Scan not completed, skipping:", scan.status);
      return null;
    }
    
    // Check if all required data is present
    if (!scan.extractedData || !scan.refinedFindings) {
      console.log("[Analytics] Missing data for analytics");
      return null;
    }
    
    // Check user's analytics preference
    const user = await ctx.db.get(scan.userId);
    if (!user) return null;
    
    const prefs = await ctx.db
      .query("userAnalyticsPrefs")
      .withIndex("by_user", (q) => q.eq("userId", scan.userId))
      .first();
    
    // Default to opted-in if no preference set
    if (prefs && !prefs.contributesToAnalytics) {
      console.log("[Analytics] User opted out of analytics");
      return null;
    }
    
    // Extract anonymized data
    const anonymizedData = extractAnonymizedData(
      scan.extractedData as Record<string, unknown>,
      scan.refinedFindings as Record<string, unknown>,
      (scan.researchResults || {}) as Record<string, unknown>
    );
    
    // Check for duplicate (same content hash in same time bucket)
    const existing = await ctx.db
      .query("scanAnalytics")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", anonymizedData.contentHash))
      .filter((q) => q.eq(q.field("timeBucket"), anonymizedData.timeBucket))
      .first();
    
    if (existing) {
      console.log("[Analytics] Duplicate content hash, skipping");
      return existing._id;
    }
    
    // Insert anonymized data
    const analyticsId = await ctx.db.insert("scanAnalytics", anonymizedData);
    console.log("[Analytics] Recorded scan analytics:", analyticsId);
    
    return analyticsId;
  },
});

/**
 * Update user analytics preference
 */
export const setAnalyticsPreference = mutation({
  args: {
    userId: v.id("users"),
    contributesToAnalytics: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userAnalyticsPrefs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        contributesToAnalytics: args.contributesToAnalytics,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("userAnalyticsPrefs", {
        userId: args.userId,
        contributesToAnalytics: args.contributesToAnalytics,
        updatedAt: Date.now(),
      });
    }
  },
});

// ============================================
// Aggregation Queries
// ============================================

/**
 * Get brand statistics for pricing context
 */
export const getBrandStats = query({
  args: {
    brand: v.string(),
    category: v.optional(v.string()),
    conditionGrade: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const category = args.category || "_all";
    const condition = args.conditionGrade || "_all";
    
    // Try exact match first
    let stats = await ctx.db
      .query("brandStats")
      .withIndex("by_brand_category_condition", (q) => 
        q.eq("brand", args.brand.toUpperCase())
         .eq("category", category)
         .eq("conditionGrade", condition)
      )
      .first();
    
    // Fall back to brand+category only
    if (!stats && condition !== "_all") {
      stats = await ctx.db
        .query("brandStats")
        .withIndex("by_brand_category", (q) => 
          q.eq("brand", args.brand.toUpperCase())
           .eq("category", category)
        )
        .filter((q) => q.eq(q.field("conditionGrade"), "_all"))
        .first();
    }
    
    // Fall back to brand only
    if (!stats && category !== "_all") {
      stats = await ctx.db
        .query("brandStats")
        .withIndex("by_brand", (q) => q.eq("brand", args.brand.toUpperCase()))
        .filter((q) => 
          q.and(
            q.eq(q.field("category"), "_all"),
            q.eq(q.field("conditionGrade"), "_all")
          )
        )
        .first();
    }
    
    return stats;
  },
});

/**
 * Get recent scan analytics for a brand (for trend analysis)
 */
export const getRecentBrandAnalytics = query({
  args: {
    brand: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    const analytics = await ctx.db
      .query("scanAnalytics")
      .withIndex("by_brand", (q) => q.eq("brand", args.brand.toUpperCase()))
      .order("desc")
      .take(limit);
    
    return analytics;
  },
});

/**
 * Get analytics summary across all data
 */
export const getAnalyticsSummary = query({
  args: {},
  handler: async (ctx) => {
    const allAnalytics = await ctx.db.query("scanAnalytics").collect();
    
    // Get unique brands
    const brands = new Set<string>();
    let totalPriceData = 0;
    let priceSum = 0;
    
    for (const item of allAnalytics) {
      if (item.brand) brands.add(item.brand);
      if (item.priceRecommended) {
        totalPriceData++;
        priceSum += item.priceRecommended;
      }
    }
    
    // Get brand stats count
    const brandStats = await ctx.db.query("brandStats").collect();
    
    return {
      totalScansAnonymized: allAnalytics.length,
      uniqueBrands: brands.size,
      scansWithPriceData: totalPriceData,
      avgRecommendedPrice: totalPriceData > 0 ? priceSum / totalPriceData : 0,
      brandStatsComputed: brandStats.length,
    };
  },
});

// ============================================
// Brand Stats Aggregation (Internal)
// ============================================

/**
 * Compute and update brand statistics from scan analytics
 * Should be run periodically (e.g., daily) or after sufficient new data
 */
export const computeBrandStats = internalMutation({
  args: {
    brand: v.string(),
  },
  handler: async (ctx, args) => {
    const brandUpper = args.brand.toUpperCase();
    
    // Get all analytics for this brand
    const analytics = await ctx.db
      .query("scanAnalytics")
      .withIndex("by_brand", (q) => q.eq("brand", brandUpper))
      .collect();
    
    if (analytics.length === 0) {
      console.log("[Analytics] No data for brand:", brandUpper);
      return null;
    }
    
    // Filter to items with price data
    const withPrices = analytics.filter((a) => a.priceRecommended != null);
    
    if (withPrices.length < 3) {
      console.log("[Analytics] Insufficient price data for brand:", brandUpper);
      return null;
    }
    
    // Calculate statistics
    const prices = withPrices.map((a) => a.priceRecommended!).sort((a, b) => a - b);
    const priceMin = prices[0];
    const priceMax = prices[prices.length - 1];
    const priceAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const priceMedian = prices[Math.floor(prices.length / 2)];
    const priceP25 = prices[Math.floor(prices.length * 0.25)];
    const priceP75 = prices[Math.floor(prices.length * 0.75)];
    
    // Most common market activity
    const activityCounts: Record<string, number> = {};
    for (const a of analytics) {
      if (a.marketActivity) {
        activityCounts[a.marketActivity] = (activityCounts[a.marketActivity] || 0) + 1;
      }
    }
    const avgMarketActivity = Object.entries(activityCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    
    // Most common demand level
    const demandCounts: Record<string, number> = {};
    for (const a of analytics) {
      if (a.demandLevel) {
        demandCounts[a.demandLevel] = (demandCounts[a.demandLevel] || 0) + 1;
      }
    }
    const avgDemandLevel = Object.entries(demandCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    
    // Check for existing stats entry
    const existing = await ctx.db
      .query("brandStats")
      .withIndex("by_brand_category_condition", (q) =>
        q.eq("brand", brandUpper)
         .eq("category", "_all")
         .eq("conditionGrade", "_all")
      )
      .first();
    
    const statsData = {
      brand: brandUpper,
      category: "_all",
      conditionGrade: "_all",
      sampleSize: withPrices.length,
      priceMin,
      priceMax,
      priceAvg,
      priceMedian,
      priceP25,
      priceP75,
      avgMarketActivity,
      avgDemandLevel,
      lastUpdated: Date.now(),
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, statsData);
      console.log("[Analytics] Updated brand stats:", brandUpper);
      return existing._id;
    } else {
      const id = await ctx.db.insert("brandStats", statsData);
      console.log("[Analytics] Created brand stats:", brandUpper);
      return id;
    }
  },
});

/**
 * Recompute all brand statistics
 */
export const recomputeAllBrandStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all unique brands from analytics
    const analytics = await ctx.db.query("scanAnalytics").collect();
    const brands = new Set<string>();
    
    for (const item of analytics) {
      if (item.brand) brands.add(item.brand);
    }
    
    console.log(`[Analytics] Recomputing stats for ${brands.size} brands`);
    
    // Note: In production, this should be batched or use scheduled functions
    // For now, we'll just log the brands that need updating
    return {
      brandsToUpdate: Array.from(brands),
      count: brands.size,
    };
  },
});

