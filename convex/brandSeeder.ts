"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { BRAND_SEED_DATA, getBrandCountByTier } from "./brandSeedData";

/**
 * Brand Database Seeder
 * Action to populate the brands table with initial data
 */

// Seed all brands from the seed data file
export const seedAllBrands = action({
  args: {},
  handler: async (ctx): Promise<{ added: number; skipped: number; total: number }> => {
    console.log(`[BrandSeeder] Starting seed with ${BRAND_SEED_DATA.length} brands...`);
    console.log("[BrandSeeder] Brands by tier:", getBrandCountByTier());
    
    // Seed in batches to avoid timeout
    const BATCH_SIZE = 20;
    let totalAdded = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < BRAND_SEED_DATA.length; i += BATCH_SIZE) {
      const batch = BRAND_SEED_DATA.slice(i, i + BATCH_SIZE);
      
      const result = await ctx.runMutation(internal.brands.seedBrands, {
        brands: batch,
      });
      
      totalAdded += result.added;
      totalSkipped += result.skipped;
      
      console.log(`[BrandSeeder] Batch ${Math.floor(i / BATCH_SIZE) + 1}: added ${result.added}, skipped ${result.skipped}`);
    }
    
    console.log(`[BrandSeeder] Complete! Added: ${totalAdded}, Skipped: ${totalSkipped}`);
    
    return {
      added: totalAdded,
      skipped: totalSkipped,
      total: BRAND_SEED_DATA.length,
    };
  },
});

