import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

/**
 * Scan management - CRUD operations for clothing tag scans
 */

// Create a new scan after image upload
export const createScan = mutation({
  args: {
    userId: v.id("users"),
    imageStorageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const scanId = await ctx.db.insert("scans", {
      userId: args.userId,
      imageStorageId: args.imageStorageId,
      thumbnailStorageId: args.thumbnailStorageId,
      status: "uploaded",
    });
    return scanId;
  },
});

// Get a single scan by ID
export const getScan = query({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (!scan) return null;

    // Get image URLs
    const imageUrl = await ctx.storage.getUrl(scan.imageStorageId);
    const thumbnailUrl = scan.thumbnailStorageId
      ? await ctx.storage.getUrl(scan.thumbnailStorageId)
      : null;

    return {
      ...scan,
      imageUrl,
      thumbnailUrl,
    };
  },
});

// Get all scans for a user (most recent first)
export const getUserScans = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    // Attach image URLs to each scan
    return Promise.all(
      scans.map(async (scan) => {
        const imageUrl = await ctx.storage.getUrl(scan.imageStorageId);
        const thumbnailUrl = scan.thumbnailStorageId
          ? await ctx.storage.getUrl(scan.thumbnailStorageId)
          : null;
        return { ...scan, imageUrl, thumbnailUrl };
      })
    );
  },
});

// Get scans by status (for processing queue)
export const getScansByStatus = query({
  args: {
    status: v.union(
      v.literal("uploaded"),
      v.literal("extracting"),
      v.literal("researching"),
      v.literal("refining"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scans")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

// Update scan status (used by pipeline stages)
export const updateScanStatus = mutation({
  args: {
    scanId: v.id("scans"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("extracting"),
      v.literal("researching"),
      v.literal("refining"),
      v.literal("completed"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      status: args.status,
      ...(args.errorMessage && { errorMessage: args.errorMessage }),
    });
  },
});

// Update scan with extracted data (Stage 1 output)
export const updateExtractedData = mutation({
  args: {
    scanId: v.id("scans"),
    extractedData: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      extractedData: args.extractedData,
      status: "researching",
    });
  },
});

// Update scan with research results (Stage 2 output)
export const updateResearchResults = mutation({
  args: {
    scanId: v.id("scans"),
    researchResults: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      researchResults: args.researchResults,
      status: "refining",
    });
  },
});

// Update scan with refined findings (Stage 3 output)
export const updateRefinedFindings = mutation({
  args: {
    scanId: v.id("scans"),
    refinedFindings: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      refinedFindings: args.refinedFindings,
      status: "completed",
    });
  },
});

// Delete a scan
export const deleteScan = mutation({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (scan) {
      // Delete associated images from storage
      await ctx.storage.delete(scan.imageStorageId);
      if (scan.thumbnailStorageId) {
        await ctx.storage.delete(scan.thumbnailStorageId);
      }
      // Delete the scan record
      await ctx.db.delete(args.scanId);
    }
  },
});

// Generate upload URL for image
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// ============================================
// Multi-image support (scanImages table)
// ============================================

// Add an image to a scan
export const addScanImage = mutation({
  args: {
    scanId: v.id("scans"),
    imageStorageId: v.id("_storage"),
    thumbnailStorageId: v.optional(v.id("_storage")),
    imageType: v.optional(v.union(
      v.literal("tag"),
      v.literal("garment"),
      v.literal("condition"),
      v.literal("detail"),
      v.literal("unknown")
    )),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scanImages", {
      scanId: args.scanId,
      imageStorageId: args.imageStorageId,
      thumbnailStorageId: args.thumbnailStorageId,
      imageType: args.imageType || "unknown",
      processed: false,
    });
  },
});

// Get all images for a scan
export const getScanImages = query({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("scanImages")
      .withIndex("by_scan", (q) => q.eq("scanId", args.scanId))
      .collect();

    // Attach URLs
    return Promise.all(
      images.map(async (img) => {
        const imageUrl = await ctx.storage.getUrl(img.imageStorageId);
        const thumbnailUrl = img.thumbnailStorageId
          ? await ctx.storage.getUrl(img.thumbnailStorageId)
          : null;
        return { ...img, imageUrl, thumbnailUrl };
      })
    );
  },
});

// Update scan image analysis result (internal)
export const updateScanImageAnalysis = internalMutation({
  args: {
    scanImageId: v.id("scanImages"),
    imageType: v.union(
      v.literal("tag"),
      v.literal("garment"),
      v.literal("condition"),
      v.literal("detail"),
      v.literal("unknown")
    ),
    analysisResult: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanImageId, {
      imageType: args.imageType,
      analysisResult: args.analysisResult,
      processed: true,
    });
  },
});

// Mark scan image as failed
export const markScanImageFailed = internalMutation({
  args: {
    scanImageId: v.id("scanImages"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanImageId, {
      processed: true,
      errorMessage: args.errorMessage,
    });
  },
});

// ============================================
// Internal mutations (called by actions)
// ============================================

export const updateExtractedDataInternal = internalMutation({
  args: {
    scanId: v.id("scans"),
    extractedData: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      extractedData: args.extractedData,
      status: "researching",
    });
  },
});

export const updateResearchResultsInternal = internalMutation({
  args: {
    scanId: v.id("scans"),
    researchResults: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      researchResults: args.researchResults,
      status: "refining",
    });
  },
});

export const updateRefinedFindingsInternal = internalMutation({
  args: {
    scanId: v.id("scans"),
    refinedFindings: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      refinedFindings: args.refinedFindings,
      status: "completed",
    });
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    scanId: v.id("scans"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("extracting"),
      v.literal("researching"),
      v.literal("refining"),
      v.literal("completed"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scanId, {
      status: args.status,
      ...(args.errorMessage && { errorMessage: args.errorMessage }),
    });
  },
});

