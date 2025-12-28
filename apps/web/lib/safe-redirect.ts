/**
 * Safe redirect utilities to prevent open redirect vulnerabilities
 */

// Allowed hosts for redirects (add external trusted domains if needed)
const ALLOWED_HOSTS: Set<string> = new Set([
  // Add any external trusted domains here if needed
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
    console.warn(`Blocked protocol-relative redirect: ${trimmed}`);
    return fallback;
  }

  // Block javascript: and data: URLs
  const lowerUrl = trimmed.toLowerCase();
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('vbscript:')
  ) {
    console.warn(`Blocked dangerous protocol redirect: ${trimmed}`);
    return fallback;
  }

  // If it's a relative path (starts with /), it's safe
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Normalize to prevent path traversal tricks
    // Remove any double slashes that might appear after the first character
    const normalized = trimmed.replace(/\/+/g, '/');
    return normalized;
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
    console.warn(
      `Blocked cross-origin redirect: ${trimmed} (expected host: ${parsedOrigin.host}, got: ${parsedUrl.host})`,
    );
    return fallback;
  } catch {
    // Invalid URL - use fallback
    console.warn(`Invalid redirect URL: ${trimmed}`);
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
