import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Pipeline Metrics - Aggregation queries for usage analytics
 * Provides visibility into pipeline performance, costs, and error rates
 */

// Get aggregate pipeline metrics
export const getPipelineMetrics = query({
  args: {
    // Optional time range filter (in days)
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get all pipeline runs (optionally filtered by time)
    let runs = await ctx.db.query("pipelineRuns").collect();
    
    // Filter by time range if specified
    if (args.days) {
      const cutoffTime = Date.now() - args.days * 24 * 60 * 60 * 1000;
      runs = runs.filter(run => run._creationTime >= cutoffTime);
    }

    if (runs.length === 0) {
      return {
        totalRuns: 0,
        successRate: 0,
        avgDurationMs: 0,
        byStage: {},
        byProvider: {},
        totalCostUsd: 0,
        totalTokens: 0,
      };
    }

    // Calculate overall metrics
    const successfulRuns = runs.filter(r => r.success);
    const successRate = (successfulRuns.length / runs.length) * 100;
    const avgDurationMs = runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length;
    
    // Total cost and tokens
    const totalCostUsd = runs.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
    const totalTokens = runs.reduce((sum, r) => sum + (r.totalTokens || 0), 0);

    // Metrics by stage
    const stages = ["extraction", "research", "refinement"];
    const byStage: Record<string, {
      count: number;
      successRate: number;
      avgDurationMs: number;
      p50DurationMs: number;
      p95DurationMs: number;
      totalCostUsd: number;
      avgTokens: number;
    }> = {};

    for (const stage of stages) {
      const stageRuns = runs.filter(r => r.stage === stage);
      if (stageRuns.length === 0) continue;

      const successful = stageRuns.filter(r => r.success);
      const durations = stageRuns.map(r => r.durationMs).sort((a, b) => a - b);
      const costs = stageRuns.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
      const tokens = stageRuns.filter(r => r.totalTokens).map(r => r.totalTokens!);
      
      byStage[stage] = {
        count: stageRuns.length,
        successRate: (successful.length / stageRuns.length) * 100,
        avgDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
        p50DurationMs: durations[Math.floor(durations.length * 0.5)] || 0,
        p95DurationMs: durations[Math.floor(durations.length * 0.95)] || 0,
        totalCostUsd: costs,
        avgTokens: tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) / tokens.length : 0,
      };
    }

    // Metrics by provider
    const providers = [...new Set(runs.map(r => r.provider))];
    const byProvider: Record<string, {
      count: number;
      successRate: number;
      avgDurationMs: number;
      totalCostUsd: number;
      avgInputTokens: number;
      avgOutputTokens: number;
    }> = {};

    for (const provider of providers) {
      const providerRuns = runs.filter(r => r.provider === provider);
      const successful = providerRuns.filter(r => r.success);
      const costs = providerRuns.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
      const withTokens = providerRuns.filter(r => r.inputTokens && r.outputTokens);
      
      byProvider[provider] = {
        count: providerRuns.length,
        successRate: (successful.length / providerRuns.length) * 100,
        avgDurationMs: providerRuns.reduce((sum, r) => sum + r.durationMs, 0) / providerRuns.length,
        totalCostUsd: costs,
        avgInputTokens: withTokens.length > 0 
          ? withTokens.reduce((sum, r) => sum + r.inputTokens!, 0) / withTokens.length 
          : 0,
        avgOutputTokens: withTokens.length > 0 
          ? withTokens.reduce((sum, r) => sum + r.outputTokens!, 0) / withTokens.length 
          : 0,
      };
    }

    return {
      totalRuns: runs.length,
      successRate,
      avgDurationMs,
      byStage,
      byProvider,
      totalCostUsd,
      totalTokens,
    };
  },
});

// Get recent pipeline runs with full details
export const getRecentPipelineRuns = query({
  args: {
    limit: v.optional(v.number()),
    stage: v.optional(v.string()),
    provider: v.optional(v.string()),
    successOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    // Start with all runs, ordered by creation time (desc)
    let runs = await ctx.db
      .query("pipelineRuns")
      .order("desc")
      .collect();

    // Apply filters
    if (args.stage) {
      runs = runs.filter(r => r.stage === args.stage);
    }
    if (args.provider) {
      runs = runs.filter(r => r.provider === args.provider);
    }
    if (args.successOnly !== undefined) {
      runs = runs.filter(r => r.success === args.successOnly);
    }

    // Limit results
    runs = runs.slice(0, limit);

    // Return with formatted data
    return runs.map(run => ({
      id: run._id,
      scanId: run.scanId,
      stage: run.stage,
      provider: run.provider,
      durationMs: run.durationMs,
      success: run.success,
      errorMessage: run.errorMessage,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      totalTokens: run.totalTokens,
      estimatedCostUsd: run.estimatedCostUsd,
      createdAt: run._creationTime,
      details: run.details,
    }));
  },
});

// Get cost summary by provider and time period
export const getCostSummary = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 30;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    
    const runs = await ctx.db.query("pipelineRuns").collect();
    const recentRuns = runs.filter(r => r._creationTime >= cutoffTime);

    // Group by provider
    const byProvider: Record<string, {
      totalCost: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      runCount: number;
    }> = {};

    for (const run of recentRuns) {
      if (!byProvider[run.provider]) {
        byProvider[run.provider] = {
          totalCost: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          runCount: 0,
        };
      }
      
      byProvider[run.provider].totalCost += run.estimatedCostUsd || 0;
      byProvider[run.provider].totalInputTokens += run.inputTokens || 0;
      byProvider[run.provider].totalOutputTokens += run.outputTokens || 0;
      byProvider[run.provider].runCount += 1;
    }

    // Group by day
    const byDay: Record<string, number> = {};
    for (const run of recentRuns) {
      const day = new Date(run._creationTime).toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + (run.estimatedCostUsd || 0);
    }

    const totalCost = recentRuns.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
    const avgCostPerScan = recentRuns.length > 0 
      ? totalCost / [...new Set(recentRuns.map(r => r.scanId))].length 
      : 0;

    return {
      period: `Last ${days} days`,
      totalCost,
      avgCostPerScan,
      byProvider,
      byDay,
    };
  },
});

// Get error summary
export const getErrorSummary = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 7;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    
    const runs = await ctx.db.query("pipelineRuns").collect();
    const recentRuns = runs.filter(r => r._creationTime >= cutoffTime);
    const failedRuns = recentRuns.filter(r => !r.success);

    // Group errors by message pattern
    const errorPatterns: Record<string, {
      count: number;
      stage: string;
      provider: string;
      lastOccurrence: number;
      examples: string[];
    }> = {};

    for (const run of failedRuns) {
      const errorKey = run.errorMessage?.substring(0, 50) || "Unknown error";
      
      if (!errorPatterns[errorKey]) {
        errorPatterns[errorKey] = {
          count: 0,
          stage: run.stage,
          provider: run.provider,
          lastOccurrence: run._creationTime,
          examples: [],
        };
      }
      
      errorPatterns[errorKey].count += 1;
      if (run._creationTime > errorPatterns[errorKey].lastOccurrence) {
        errorPatterns[errorKey].lastOccurrence = run._creationTime;
      }
      if (errorPatterns[errorKey].examples.length < 3 && run.errorMessage) {
        errorPatterns[errorKey].examples.push(run.errorMessage);
      }
    }

    // Error rate by stage
    const errorsByStage: Record<string, { total: number; failed: number; rate: number }> = {};
    for (const stage of ["extraction", "research", "refinement"]) {
      const stageRuns = recentRuns.filter(r => r.stage === stage);
      const stageFailed = stageRuns.filter(r => !r.success);
      errorsByStage[stage] = {
        total: stageRuns.length,
        failed: stageFailed.length,
        rate: stageRuns.length > 0 ? (stageFailed.length / stageRuns.length) * 100 : 0,
      };
    }

    return {
      period: `Last ${days} days`,
      totalErrors: failedRuns.length,
      overallErrorRate: recentRuns.length > 0 
        ? (failedRuns.length / recentRuns.length) * 100 
        : 0,
      errorPatterns: Object.entries(errorPatterns)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([pattern, data]) => ({
          pattern,
          ...data,
        })),
      errorsByStage,
    };
  },
});

// Get metrics for a specific scan
export const getScanMetrics = query({
  args: {
    scanId: v.id("scans"),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_scan", q => q.eq("scanId", args.scanId))
      .collect();

    const totalDuration = runs.reduce((sum, r) => sum + r.durationMs, 0);
    const totalCost = runs.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
    const totalTokens = runs.reduce((sum, r) => sum + (r.totalTokens || 0), 0);

    return {
      scanId: args.scanId,
      stages: runs.map(r => ({
        stage: r.stage,
        provider: r.provider,
        durationMs: r.durationMs,
        success: r.success,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        estimatedCostUsd: r.estimatedCostUsd,
        errorMessage: r.errorMessage,
      })),
      totals: {
        durationMs: totalDuration,
        costUsd: totalCost,
        tokens: totalTokens,
      },
    };
  },
});

