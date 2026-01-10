import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

/**
 * Brand Database - Reference data for clothing brands
 * Used for alias resolution, tier classification, and search improvement
 */

// Brand tier type for reuse
const brandTier = v.union(
  v.literal("luxury"),
  v.literal("premium"),
  v.literal("mid-range"),
  v.literal("budget"),
  v.literal("vintage"),
  v.literal("unknown")
);

// ============================================
// Public Queries
// ============================================

// Get a brand by exact canonical name
export const getBrandByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brands")
      .withIndex("by_name", (q) => q.eq("name", args.name.toUpperCase()))
      .unique();
  },
});

// Search brands by name (fuzzy search)
export const searchBrands = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    
    // Search in canonical names
    const nameResults = await ctx.db
      .query("brands")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .take(10);
    
    return nameResults;
  },
});

// Look up brand by alias (exact match)
export const getBrandByAlias = query({
  args: { alias: v.string() },
  handler: async (ctx, args) => {
    const normalizedAlias = args.alias.toUpperCase().trim();
    
    // First try exact canonical name match
    const exactMatch = await ctx.db
      .query("brands")
      .withIndex("by_name", (q) => q.eq("name", normalizedAlias))
      .unique();
    
    if (exactMatch) return exactMatch;
    
    // Then search aliases - need to scan since aliases is an array
    const allBrands = await ctx.db.query("brands").collect();
    return allBrands.find((brand) =>
      brand.aliases.some((a) => a.toUpperCase() === normalizedAlias)
    ) || null;
  },
});

// Look up brand by RN number
export const getBrandByRN = query({
  args: { rnNumber: v.string() },
  handler: async (ctx, args) => {
    const allBrands = await ctx.db.query("brands").collect();
    return allBrands.find((brand) =>
      brand.rnNumbers?.includes(args.rnNumber)
    ) || null;
  },
});

// Get all brands (for admin/debugging)
export const getAllBrands = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("brands").collect();
  },
});

// Get brands by tier
export const getBrandsByTier = query({
  args: { tier: brandTier },
  handler: async (ctx, args) => {
    const allBrands = await ctx.db.query("brands").collect();
    return allBrands.filter((brand) => brand.tier === args.tier);
  },
});

// ============================================
// Internal Queries (for pipeline use)
// ============================================

// Resolve a brand name to its canonical form and metadata
export const resolveBrand = internalQuery({
  args: { brandName: v.string() },
  handler: async (ctx, args): Promise<{
    canonical: string;
    tier: string;
    found: boolean;
    brand?: {
      name: string;
      tier: string;
      aliases: string[];
      categories: string[];
    };
  }> => {
    const normalizedName = args.brandName.toUpperCase().trim();
    
    // Try exact canonical match first
    const exactMatch = await ctx.db
      .query("brands")
      .withIndex("by_name", (q) => q.eq("name", normalizedName))
      .unique();
    
    if (exactMatch) {
      return {
        canonical: exactMatch.name,
        tier: exactMatch.tier,
        found: true,
        brand: {
          name: exactMatch.name,
          tier: exactMatch.tier,
          aliases: exactMatch.aliases,
          categories: exactMatch.categories,
        },
      };
    }
    
    // Try alias match
    const allBrands = await ctx.db.query("brands").collect();
    const aliasMatch = allBrands.find((brand) =>
      brand.aliases.some((a) => a.toUpperCase() === normalizedName)
    );
    
    if (aliasMatch) {
      return {
        canonical: aliasMatch.name,
        tier: aliasMatch.tier,
        found: true,
        brand: {
          name: aliasMatch.name,
          tier: aliasMatch.tier,
          aliases: aliasMatch.aliases,
          categories: aliasMatch.categories,
        },
      };
    }
    
    // Not found - return input as-is
    return {
      canonical: normalizedName,
      tier: "unknown",
      found: false,
    };
  },
});

// ============================================
// Mutations
// ============================================

// Add a new brand
export const addBrand = mutation({
  args: {
    name: v.string(),
    aliases: v.array(v.string()),
    tier: brandTier,
    parentCompany: v.optional(v.string()),
    categories: v.array(v.string()),
    rnNumbers: v.optional(v.array(v.string())),
    wplNumbers: v.optional(v.array(v.string())),
    founded: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize name to uppercase
    const normalizedName = args.name.toUpperCase().trim();
    
    // Check for existing brand
    const existing = await ctx.db
      .query("brands")
      .withIndex("by_name", (q) => q.eq("name", normalizedName))
      .unique();
    
    if (existing) {
      throw new Error(`Brand "${normalizedName}" already exists`);
    }
    
    return await ctx.db.insert("brands", {
      ...args,
      name: normalizedName,
      aliases: args.aliases.map((a) => a.toUpperCase().trim()),
    });
  },
});

// Update a brand
export const updateBrand = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    tier: v.optional(brandTier),
    parentCompany: v.optional(v.string()),
    categories: v.optional(v.array(v.string())),
    rnNumbers: v.optional(v.array(v.string())),
    wplNumbers: v.optional(v.array(v.string())),
    founded: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { brandId, ...updates } = args;
    
    // Normalize if name is being updated
    if (updates.name) {
      updates.name = updates.name.toUpperCase().trim();
    }
    if (updates.aliases) {
      updates.aliases = updates.aliases.map((a) => a.toUpperCase().trim());
    }
    
    await ctx.db.patch(brandId, updates);
  },
});

// Delete a brand
export const deleteBrand = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.brandId);
  },
});

// Internal: Seed multiple brands at once
export const seedBrands = internalMutation({
  args: {
    brands: v.array(
      v.object({
        name: v.string(),
        aliases: v.array(v.string()),
        tier: brandTier,
        parentCompany: v.optional(v.string()),
        categories: v.array(v.string()),
        rnNumbers: v.optional(v.array(v.string())),
        wplNumbers: v.optional(v.array(v.string())),
        founded: v.optional(v.string()),
        website: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let added = 0;
    let skipped = 0;
    
    for (const brand of args.brands) {
      const normalizedName = brand.name.toUpperCase().trim();
      
      // Check if already exists
      const existing = await ctx.db
        .query("brands")
        .withIndex("by_name", (q) => q.eq("name", normalizedName))
        .unique();
      
      if (existing) {
        skipped++;
        continue;
      }
      
      await ctx.db.insert("brands", {
        ...brand,
        name: normalizedName,
        aliases: brand.aliases.map((a) => a.toUpperCase().trim()),
      });
      added++;
    }
    
    return { added, skipped };
  },
});

// Internal: Update brand stats from analytics
export const updateBrandStats = internalMutation({
  args: {
    brandId: v.id("brands"),
    avgResalePrice: v.optional(v.number()),
    scanCount: v.optional(v.number()),
    priceConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { brandId, ...stats } = args;
    await ctx.db.patch(brandId, stats);
  },
});

