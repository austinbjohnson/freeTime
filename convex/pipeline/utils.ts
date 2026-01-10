"use node";

import { Jimp } from "jimp";

/**
 * Pipeline Utilities
 * Shared helper functions for pipeline stages
 */

// Maximum base64 size for AI APIs (Anthropic limit is 5MB, we target 4MB for safety)
const MAX_BASE64_SIZE = 4 * 1024 * 1024; // 4MB
const TARGET_WIDTH = 1920; // Max width for processing
const JPEG_QUALITY = 85;

/**
 * Compress and resize image if needed for AI API limits
 * Returns base64 string optimized for API calls
 */
export async function optimizeImageForAI(imageBuffer: Buffer): Promise<string> {
  let base64 = imageBuffer.toString("base64");
  
  // If already small enough, return as-is
  if (base64.length <= MAX_BASE64_SIZE) {
    console.log(`[Image] Size OK: ${(base64.length / 1024 / 1024).toFixed(2)}MB`);
    return base64;
  }
  
  console.log(`[Image] Too large (${(base64.length / 1024 / 1024).toFixed(2)}MB), optimizing...`);
  
  // Load image with Jimp
  let image = await Jimp.read(imageBuffer);
  const currentWidth = image.width;
  
  // Resize if wider than target
  if (currentWidth > TARGET_WIDTH) {
    image = image.resize({ w: TARGET_WIDTH });
  }
  
  // Convert to JPEG with compression
  let outputBuffer = await image.getBuffer("image/jpeg", { quality: JPEG_QUALITY });
  base64 = outputBuffer.toString("base64");
  
  // If still too large, compress more aggressively
  if (base64.length > MAX_BASE64_SIZE) {
    console.log(`[Image] Still large (${(base64.length / 1024 / 1024).toFixed(2)}MB), compressing more...`);
    image = image.resize({ w: Math.min(image.width, 1280) });
    outputBuffer = await image.getBuffer("image/jpeg", { quality: 70 });
    base64 = outputBuffer.toString("base64");
  }
  
  // Final attempt with very aggressive compression
  if (base64.length > MAX_BASE64_SIZE) {
    console.log(`[Image] Still large, final compression...`);
    image = image.resize({ w: Math.min(image.width, 1024) });
    outputBuffer = await image.getBuffer("image/jpeg", { quality: 60 });
    base64 = outputBuffer.toString("base64");
  }
  
  console.log(`[Image] Optimized to ${(base64.length / 1024 / 1024).toFixed(2)}MB`);
  return base64;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: [
    "rate_limit",
    "timeout",
    "429",
    "503",
    "502",
    "500",
    "ECONNRESET",
    "ETIMEDOUT",
    "overloaded",
  ],
};

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(
  error: Error | string,
  retryablePatterns: string[]
): boolean {
  const errorMessage =
    typeof error === "string" ? error : error.message.toLowerCase();
  return retryablePatterns.some((pattern) =>
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry =
        attempt < opts.maxRetries &&
        isRetryableError(lastError, opts.retryableErrors || []);

      if (!shouldRetry) {
        throw lastError;
      }

      // Calculate delay and wait
      const delay = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs);
      console.log(
        `[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`
      );
      await sleep(delay);
    }
  }

  throw lastError || new Error("Retry failed with unknown error");
}

/**
 * Validate extracted data has minimum required fields
 */
export function validateExtractedData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  
  // Must have at least one identifying field
  const hasIdentifier = Boolean(
    d.brand || d.styleNumber || d.sku || d.rnNumber || d.wplNumber
  );
  
  // Must have confidence score
  const hasConfidence = typeof d.confidence === "number";
  
  return hasIdentifier && hasConfidence;
}

/**
 * Sanitize and normalize extracted data
 */
export function normalizeExtractedData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  // String fields - trim and uppercase brand
  if (typeof data.brand === "string") {
    normalized.brand = data.brand.trim().toUpperCase();
  }
  
  // Preserve other string fields
  const stringFields = [
    "styleNumber", "sku", "size", "countryOfOrigin", 
    "rnNumber", "wplNumber"
  ];
  for (const field of stringFields) {
    if (typeof data[field] === "string") {
      normalized[field] = data[field];
    }
  }
  
  // Array fields
  const arrayFields = ["materials", "careInstructions", "rawText"];
  for (const field of arrayFields) {
    if (Array.isArray(data[field])) {
      normalized[field] = data[field];
    }
  }
  
  // Confidence - clamp to 0-1
  if (typeof data.confidence === "number") {
    normalized.confidence = Math.max(0, Math.min(1, data.confidence));
  } else {
    normalized.confidence = 0.5; // Default if missing
  }
  
  return normalized;
}

/**
 * Format error message for user display
 */
export function formatUserError(error: Error): string {
  const message = error.message.toLowerCase();
  
  if (message.includes("rate_limit") || message.includes("429")) {
    return "Service is temporarily busy. Please try again in a moment.";
  }
  if (message.includes("timeout") || message.includes("etimedout")) {
    return "Request timed out. Please try again.";
  }
  if (message.includes("api key") || message.includes("unauthorized")) {
    return "Service configuration error. Please contact support.";
  }
  if (message.includes("not found")) {
    return "Image could not be found. Please try uploading again.";
  }
  if (message.includes("parse") || message.includes("json")) {
    return "Could not read tag information. Please try with a clearer image.";
  }
  
  return "An error occurred processing your image. Please try again.";
}

// ============================================
// Token Usage and Cost Tracking
// ============================================

export type AIProvider = "openai" | "anthropic";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Pricing per 1M tokens (USD) - Jan 2026
// Source: https://openai.com/pricing and https://anthropic.com/pricing
const AI_PRICING: Record<AIProvider, { input: number; output: number }> = {
  openai: {
    // GPT-4o pricing
    input: 2.50,   // $2.50 per 1M input tokens
    output: 10.00, // $10.00 per 1M output tokens
  },
  anthropic: {
    // Claude Sonnet 4 pricing
    input: 3.00,   // $3.00 per 1M input tokens
    output: 15.00, // $15.00 per 1M output tokens
  },
};

/**
 * Calculate estimated cost in USD for AI API usage
 */
export function calculateCost(
  provider: AIProvider,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = AI_PRICING[provider];
  if (!pricing) {
    console.warn(`[Cost] Unknown provider: ${provider}, defaulting to OpenAI pricing`);
    return calculateCost("openai", inputTokens, outputTokens);
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Extract token usage from OpenAI API response
 */
export function extractOpenAITokens(response: Record<string, unknown>): TokenUsage | null {
  const usage = response.usage as Record<string, number> | undefined;
  if (!usage) return null;
  
  return {
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  };
}

/**
 * Extract token usage from Anthropic API response
 */
export function extractAnthropicTokens(response: Record<string, unknown>): TokenUsage | null {
  const usage = response.usage as Record<string, number> | undefined;
  if (!usage) return null;
  
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

