/**
 * Research Cache - Cache lookup and update functions
 * 
 * This module provides functions to:
 * 1. Look up cached decoded style info and market data
 * 2. Store new decoded/research results in the cache
 * 3. Track cache hits for analytics
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { decodeStyleCode, DecodedStyleInfo } from "./brandDecoders";

// Cache TTL for market data (7 days in milliseconds)
const MARKET_DATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================
// Types
// ============================================

export interface CachedResearchData {
  brand: string;
  normalizedCode: string;
  decodedInfo?: {
    productLine?: string;
    category?: string;
    season?: string;
    year?: string;
    gender?: string;
    material?: string;
    patternType?: string;
    confidence: number;
    searchTerms: string[];
  };
  marketData?: {
    avgPrice?: number;
    priceRangeLow?: number;
    priceRangeHigh?: number;
    currency: string;
    listingsFound: number;
    soldListingsFound: number;
    marketActivity?: string;
    sources: string[];
  };
  cacheHit: boolean;
  marketDataFresh: boolean;  // Is market data within TTL?
}

// ============================================
// Internal Queries
// ============================================

/**
 * Look up a style code in the cache
 * Also decodes the style code if not cached
 */
export const lookupStyleCode = internalQuery({
  args: {
    brand: v.string(),
    styleCode: v.string(),
  },
  handler: async (ctx, args): Promise<CachedResearchData | null> => {
    const { brand, styleCode } = args;
    
    if (!brand || !styleCode) return null;
    
    // First, decode the style code to get the normalized version
    const decoded = decodeStyleCode(brand, styleCode);
    const normalizedCode = decoded?.normalizedCode || styleCode.toUpperCase().replace(/[\s\-_]/g, '');
    const normalizedBrand = brand.toUpperCase().trim();
    
    // Look up in cache
    const cached = await ctx.db
      .query("researchCache")
      .withIndex("by_brand_code", (q) => 
        q.eq("brand", normalizedBrand).eq("normalizedCode", normalizedCode)
      )
      .unique();
    
    const now = Date.now();
    
    if (cached) {
      // Check if market data is still fresh
      const marketDataFresh = cached.marketData 
        ? (now - cached.updatedAt) < MARKET_DATA_TTL_MS 
        : false;
      
      return {
        brand: cached.brand,
        normalizedCode: cached.normalizedCode,
        decodedInfo: cached.decodedInfo,
        marketData: cached.marketData,
        cacheHit: true,
        marketDataFresh,
      };
    }
    
    // Not in cache - return decoded info only
    if (decoded && decoded.confidence > 0.3) {
      return {
        brand: normalizedBrand,
        normalizedCode,
        decodedInfo: {
          productLine: decoded.productLine,
          category: decoded.category,
          season: decoded.season,
          year: decoded.year,
          gender: decoded.gender,
          material: decoded.material,
          patternType: decoded.patternType,
          confidence: decoded.confidence,
          searchTerms: decoded.searchTerms,
        },
        cacheHit: false,
        marketDataFresh: false,
      };
    }
    
    // No decoder and not in cache
    return {
      brand: normalizedBrand,
      normalizedCode,
      cacheHit: false,
      marketDataFresh: false,
    };
  },
});

/**
 * Get cache stats for a brand
 */
export const getBrandCacheStats = internalQuery({
  args: { brand: v.string() },
  handler: async (ctx, args) => {
    const normalizedBrand = args.brand.toUpperCase().trim();
    
    const entries = await ctx.db
      .query("researchCache")
      .withIndex("by_brand", (q) => q.eq("brand", normalizedBrand))
      .collect();
    
    const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0);
    const withMarketData = entries.filter(e => e.marketData).length;
    
    return {
      brand: normalizedBrand,
      totalEntries: entries.length,
      totalHits,
      entriesWithMarketData: withMarketData,
    };
  },
});

// ============================================
// Internal Mutations
// ============================================

/**
 * Store or update decoded style info in the cache
 */
export const cacheDecodedInfo = internalMutation({
  args: {
    brand: v.string(),
    normalizedCode: v.string(),
    decodedInfo: v.object({
      productLine: v.optional(v.string()),
      category: v.optional(v.string()),
      season: v.optional(v.string()),
      year: v.optional(v.string()),
      gender: v.optional(v.string()),
      material: v.optional(v.string()),
      patternType: v.optional(v.string()),
      confidence: v.number(),
      searchTerms: v.array(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const normalizedBrand = args.brand.toUpperCase().trim();
    const now = Date.now();
    
    // Check if entry exists
    const existing = await ctx.db
      .query("researchCache")
      .withIndex("by_brand_code", (q) => 
        q.eq("brand", normalizedBrand).eq("normalizedCode", args.normalizedCode)
      )
      .unique();
    
    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        decodedInfo: args.decodedInfo,
        updatedAt: now,
      });
      return existing._id;
    }
    
    // Create new entry
    return await ctx.db.insert("researchCache", {
      brand: normalizedBrand,
      normalizedCode: args.normalizedCode,
      decodedInfo: args.decodedInfo,
      createdAt: now,
      updatedAt: now,
      hitCount: 0,
    });
  },
});

/**
 * Store or update market data in the cache
 */
export const cacheMarketData = internalMutation({
  args: {
    brand: v.string(),
    normalizedCode: v.string(),
    marketData: v.object({
      avgPrice: v.optional(v.number()),
      priceRangeLow: v.optional(v.number()),
      priceRangeHigh: v.optional(v.number()),
      currency: v.string(),
      listingsFound: v.number(),
      soldListingsFound: v.number(),
      marketActivity: v.optional(v.string()),
      sources: v.array(v.string()),
    }),
    // Optional: include decoded info if we have it
    decodedInfo: v.optional(v.object({
      productLine: v.optional(v.string()),
      category: v.optional(v.string()),
      season: v.optional(v.string()),
      year: v.optional(v.string()),
      gender: v.optional(v.string()),
      material: v.optional(v.string()),
      patternType: v.optional(v.string()),
      confidence: v.number(),
      searchTerms: v.array(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const normalizedBrand = args.brand.toUpperCase().trim();
    const now = Date.now();
    
    // Check if entry exists
    const existing = await ctx.db
      .query("researchCache")
      .withIndex("by_brand_code", (q) => 
        q.eq("brand", normalizedBrand).eq("normalizedCode", args.normalizedCode)
      )
      .unique();
    
    if (existing) {
      // Update existing entry with new market data
      const updates: Record<string, unknown> = {
        marketData: args.marketData,
        updatedAt: now,
      };
      
      // Update decoded info if provided and we don't have it yet
      if (args.decodedInfo && !existing.decodedInfo) {
        updates.decodedInfo = args.decodedInfo;
      }
      
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }
    
    // Create new entry
    return await ctx.db.insert("researchCache", {
      brand: normalizedBrand,
      normalizedCode: args.normalizedCode,
      decodedInfo: args.decodedInfo,
      marketData: args.marketData,
      createdAt: now,
      updatedAt: now,
      hitCount: 0,
    });
  },
});

/**
 * Record a cache hit (increment hit count)
 */
export const recordCacheHit = internalMutation({
  args: {
    brand: v.string(),
    normalizedCode: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedBrand = args.brand.toUpperCase().trim();
    
    const existing = await ctx.db
      .query("researchCache")
      .withIndex("by_brand_code", (q) => 
        q.eq("brand", normalizedBrand).eq("normalizedCode", args.normalizedCode)
      )
      .unique();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        hitCount: existing.hitCount + 1,
        lastHitAt: Date.now(),
      });
    }
  },
});

/**
 * Clean up stale cache entries (market data older than TTL)
 * Call this periodically via a scheduled function
 */
export const cleanupStaleCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const staleThreshold = Date.now() - MARKET_DATA_TTL_MS;
    
    // Find entries with stale market data
    const staleEntries = await ctx.db
      .query("researchCache")
      .withIndex("by_updated")
      .filter((q) => q.lt(q.field("updatedAt"), staleThreshold))
      .take(100); // Process in batches
    
    let cleaned = 0;
    for (const entry of staleEntries) {
      if (entry.marketData) {
        // Clear market data but keep decoded info (it doesn't expire)
        await ctx.db.patch(entry._id, {
          marketData: undefined,
        });
        cleaned++;
      }
    }
    
    return { cleaned, checked: staleEntries.length };
  },
});

