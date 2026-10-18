import { logger } from './logger';

const ALLOWED_HOSTS: Set<string> = new Set([
  'chat.agiworkforce.com',
  'agiworkforce-chat.vercel.app',
]);

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
