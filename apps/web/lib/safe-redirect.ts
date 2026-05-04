/**
 * Safe redirect utilities to prevent open redirect vulnerabilities
 */

import { logger } from './logger';

// Allowed hosts for redirects - trusted subdomains for cross-origin auth flows
const ALLOWED_HOSTS: Set<string> = new Set([
  'chat.agiworkforce.com',
  'agiworkforce-chat.vercel.app',
]);

/**
 * Validates and sanitizes a redirect URL to prevent open redirect attacks.
 *
 * @param redirectUrl - The URL to validate (can be relative or absolute)
 * @param origin - The origin to validate against (e.g., 'https://example.com')
 * @param fallback - The fallback path if validation fails (default: '/')
 * @returns A safe redirect URL (always relative path or same-origin absolute URL)
 */
export function getSafeRedirectUrl(
  redirectUrl: string | null | undefined,
  origin: string,
  fallback: string = '/',
): string {
  // If no redirect URL provided, use fallback
  if (!redirectUrl) {
    return fallback;
  }

  // Trim whitespace
  const trimmed = redirectUrl.trim();

  // Empty string uses fallback
  if (!trimmed) {
    return fallback;
  }

  // Block protocol-relative URLs (//evil.com)
  if (trimmed.startsWith('//')) {
    logger.warn({ url: trimmed }, 'Blocked protocol-relative redirect');
    return fallback;
  }

  // Block javascript: and data: URLs
  const lowerUrl = trimmed.toLowerCase();
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('vbscript:')
  ) {
    logger.warn({ url: trimmed }, 'Blocked dangerous protocol redirect');
    return fallback;
  }

  // If it's a relative path (starts with /), it's safe
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Normalize only the pathname to prevent path traversal tricks with double slashes.
    // Apply to pathname only - not query string or hash - to avoid corrupting URL parameters
    // that contain URLs (e.g. /search?redirect=https://example.com).
    try {
      const u = new URL(trimmed, 'http://placeholder');
      u.pathname = u.pathname.replace(/\/+/g, '/');
      return u.pathname + u.search + u.hash;
    } catch {
      return fallback;
    }
  }

  // Try to parse as URL to check if it's same-origin
  try {
    const parsedUrl = new URL(trimmed, origin);
    const parsedOrigin = new URL(origin);

    // Check if the host matches our origin or is in allowed hosts
    if (parsedUrl.host === parsedOrigin.host || ALLOWED_HOSTS.has(parsedUrl.host)) {
      // Same origin - return just the pathname + search + hash to be safe
      return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    }

    // Different host - not allowed
    logger.warn(
      { url: trimmed, expectedHost: parsedOrigin.host, actualHost: parsedUrl.host },
      'Blocked cross-origin redirect',
    );
    return fallback;
  } catch {
    // Invalid URL - use fallback
    logger.warn({ url: trimmed }, 'Invalid redirect URL');
    return fallback;
  }
}

/**
 * Checks if a URL is safe for redirect (doesn't actually sanitize)
 *
 * @param redirectUrl - The URL to check
 * @param origin - The origin to validate against
 * @returns true if the URL is safe, false otherwise
 */
export function isRedirectSafe(redirectUrl: string | null | undefined, origin: string): boolean {
  if (!redirectUrl) {
    return false;
  }

  const trimmed = redirectUrl.trim();

  // Block protocol-relative URLs
  if (trimmed.startsWith('//')) {
    return false;
  }

  // Block dangerous protocols
  const lowerUrl = trimmed.toLowerCase();
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('vbscript:')
  ) {
    return false;
  }

  // Relative paths are safe
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  // Check if same-origin
  try {
    const parsedUrl = new URL(trimmed, origin);
    const parsedOrigin = new URL(origin);

    return parsedUrl.host === parsedOrigin.host || ALLOWED_HOSTS.has(parsedUrl.host);
  } catch {
    return false;
  }
}
