"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Jimp } from "jimp";
import { Id } from "./_generated/dataModel";

/**
 * Image processing utilities
 * Handles thumbnail generation and image optimization
 */

// Thumbnail settings
const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_QUALITY = 80;

/**
 * Generate a thumbnail for an uploaded image (public action)
 * Returns the storage ID of the generated thumbnail
 */
export const generateThumbnail = action({
  args: {
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<string> => {
    return await generateThumbnailCore(ctx, args.imageStorageId);
  },
});

/**
 * Generate thumbnail and update a scan image record
 * Convenience action that handles the full flow
 */
export const generateThumbnailForScanImage = action({
  args: {
    scanImageId: v.id("scanImages"),
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<string> => {
    // Generate the thumbnail
    const thumbnailStorageId = await generateThumbnailCore(ctx, args.imageStorageId);
    
    // Update the scan image record with the thumbnail
    await ctx.runMutation(internal.imagesMutations.updateScanImageThumbnail, {
      scanImageId: args.scanImageId,
      thumbnailStorageId: thumbnailStorageId as Id<"_storage">,
    });
    
    return thumbnailStorageId;
  },
});

/**
 * Internal action for generating thumbnails (called by other actions)
 */
export const generateThumbnailInternal = internalAction({
  args: {
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<string> => {
    return await generateThumbnailCore(ctx, args.imageStorageId);
  },
});

/**
 * Batch generate thumbnails for all images in a scan
 */
export const generateThumbnailsForScan = action({
  args: {
    scanId: v.id("scans"),
  },
  handler: async (ctx, args): Promise<{ processed: number; errors: string[] }> => {
    // Get all images for the scan that don't have thumbnails
    const images = await ctx.runQuery(internal.imagesMutations.getScanImagesWithoutThumbnails, {
      scanId: args.scanId,
    });
    
    const errors: string[] = [];
    let processed = 0;
    
    for (const image of images) {
      try {
        const thumbnailStorageId = await ctx.runAction(
          internal.images.generateThumbnailInternal,
          { imageStorageId: image.imageStorageId }
        );
        
        await ctx.runMutation(internal.imagesMutations.updateScanImageThumbnail, {
          scanImageId: image._id,
          thumbnailStorageId: thumbnailStorageId as Id<"_storage">,
        });
        
        processed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Image ${image._id}: ${msg}`);
        console.error(`[Thumbnail] Failed for ${image._id}:`, error);
      }
    }
    
    return { processed, errors };
  },
});

/**
 * Core thumbnail generation logic (shared by all actions)
 */
async function generateThumbnailCore(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null>; generateUploadUrl: () => Promise<string> } },
  imageStorageId: string
): Promise<string> {
  console.log(`[Thumbnail] Generating thumbnail for ${imageStorageId}`);
  
  // 1. Get the original image URL
  const imageUrl = await ctx.storage.getUrl(imageStorageId);
  if (!imageUrl) {
    throw new Error("Image not found in storage");
  }
  
  // 2. Fetch the image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  
  // 3. Generate thumbnail with Jimp
  const image = await Jimp.read(imageBuffer);
  const thumbnail = image.resize({ w: THUMBNAIL_WIDTH });
  const thumbnailBuffer = await thumbnail.getBuffer("image/jpeg", { 
    quality: THUMBNAIL_QUALITY 
  });
  
  console.log(`[Thumbnail] Generated: ${thumbnailBuffer.length} bytes`);
  
  // 4. Upload thumbnail to storage (convert Buffer to Uint8Array for fetch)
  const uploadUrl = await ctx.storage.generateUploadUrl();
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: new Uint8Array(thumbnailBuffer),
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload thumbnail: ${uploadResponse.status}`);
  }
  
  const { storageId } = await uploadResponse.json();
  console.log(`[Thumbnail] Uploaded as ${storageId}`);
  
  return storageId;
}
