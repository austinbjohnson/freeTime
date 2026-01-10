"use node";

/**
 * Pipeline Utilities
 * Shared helper functions for pipeline stages
 */

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

