import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Internal mutations for image processing
 * Separated from images.ts because "use node" files can only export actions
 */

// Update scan image with thumbnail
export const updateScanImageThumbnail = internalMutation({
  args: {
    scanImageId: v.id("scanImages"),
    thumbnailStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanImageId, {
      thumbnailStorageId: args.thumbnailStorageId,
    });
  },
});

// Update legacy scan thumbnail (for backwards compatibility)
export const updateScanThumbnail = internalMutation({
  args: {
    scanId: v.id("scans"),
    thumbnailStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      thumbnailStorageId: args.thumbnailStorageId,
    });
  },
});

// Get scan images that don't have thumbnails yet
export const getScanImagesWithoutThumbnails = internalQuery({
  args: {
    scanId: v.id("scans"),
  },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("scanImages")
      .withIndex("by_scan", (q) => q.eq("scanId", args.scanId))
      .collect();
    
    // Filter to only those without thumbnails
    return images.filter((img) => !img.thumbnailStorageId);
  },
});

