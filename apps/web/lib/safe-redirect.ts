
import { logger } from './logger';

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
  if (!redirectUrl) {
    return fallback;
  }

  const trimmed = redirectUrl.trim();

  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith('//')) {
    logger.warn({ url: trimmed }, 'Blocked protocol-relative redirect');
    return fallback;
  }

  const lowerUrl = trimmed.toLowerCase();
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('vbscript:')
  ) {
    logger.warn({ url: trimmed }, 'Blocked dangerous protocol redirect');
    return fallback;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const u = new URL(trimmed, 'http://placeholder');
      u.pathname = u.pathname.replace(/\/+/g, '/');
      return u.pathname + u.search + u.hash;
    } catch {
      return fallback;
    }
  }

  try {
    const parsedUrl = new URL(trimmed, origin);
    const parsedOrigin = new URL(origin);

    if (parsedUrl.host === parsedOrigin.host || ALLOWED_HOSTS.has(parsedUrl.host)) {
      return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    }

    logger.warn(
      { url: trimmed, expectedHost: parsedOrigin.host, actualHost: parsedUrl.host },
      'Blocked cross-origin redirect',
    );
    return fallback;
  } catch {
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

  if (trimmed.startsWith('//')) {
    return false;
  }

  const lowerUrl = trimmed.toLowerCase();
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('vbscript:')
  ) {
    return false;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmed, origin);
    const parsedOrigin = new URL(origin);

    return parsedUrl.host === parsedOrigin.host || ALLOWED_HOSTS.has(parsedUrl.host);
  } catch {
    return false;
  }
}
