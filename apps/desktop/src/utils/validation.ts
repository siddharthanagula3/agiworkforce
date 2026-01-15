/**
 * Validation utilities for the desktop application.
 *
 * This module re-exports validation functions from @agiworkforce/utils
 * and provides desktop-specific extensions.
 *
 * @module validation
 */

import { escapeHtml as escapeHtmlSecure, sanitizeHtml as sanitizeHtmlSecure } from './security';

// Re-export common validation utilities from shared package
export {
  validateEmail,
  validateFilePath,
  validatePassword,
  validateApiKey,
  validateJson,
  validateSqlQuery,
  sanitizeCommandArgs,
  type ValidationResult,
  type PasswordValidationResult,
} from '@agiworkforce/utils';

// Import validateUrl from shared package for compatibility wrapper
import { validateUrl as validateUrlShared } from '@agiworkforce/utils';

// Re-export checkForInjection from security.ts (local implementation)
// This is kept for backwards compatibility with existing code
export { checkForInjection } from './security';

/**
 * Simple URL validation (returns boolean for backwards compatibility).
 *
 * @param url - URL to validate
 * @returns Whether the URL is valid
 *
 * @deprecated Use validateUrl from @agiworkforce/utils which returns detailed results
 */
export function validateUrl(url: string): boolean {
  const result = validateUrlShared(url);
  return result.valid;
}

/**
 * Sanitize HTML content.
 *
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML string
 *
 * @deprecated Use sanitizeHtml from security.ts for proper HTML sanitization
 */
export function sanitizeHtml(html: string): string {
  console.warn('DEPRECATED: Use sanitizeHtml from security.ts for proper HTML sanitization');
  return sanitizeHtmlSecure(html);
}

/**
 * Escape HTML special characters.
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
export function escapeHtml(text: string): string {
  return escapeHtmlSecure(text);
}

/**
 * Client-side rate limiter using sliding window algorithm.
 *
 * @example
 * ```typescript
 * const limiter = new ClientRateLimiter(100, 60000); // 100 requests per minute
 *
 * if (limiter.checkLimit('user-123')) {
 *   // Allow request
 * } else {
 *   // Reject request
 * }
 * ```
 */
export class ClientRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  /**
   * Create a new rate limiter.
   *
   * @param maxRequests - Maximum requests allowed in the window (default: 100)
   * @param windowMs - Window size in milliseconds (default: 60000 = 1 minute)
   */
  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is within rate limits.
   *
   * @param key - Unique identifier for the requester
   * @returns Whether the request is allowed
   */
  checkLimit(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    const validRequests = requests.filter((timestamp) => now - timestamp < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);

    return true;
  }

  /**
   * Reset rate limit for a specific key.
   *
   * @param key - Unique identifier for the requester
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limit tracking.
   */
  clearAll(): void {
    this.requests.clear();
  }
}
