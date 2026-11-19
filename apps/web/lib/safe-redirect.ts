import { logger } from './logger';

const ALLOWED_HOSTS: Set<string> = new Set([
  'chat.agiworkforce.com',
  'agiworkforce-chat.vercel.app',
]);

const SINGLE_LEADING_SLASH = /^\/(?![/\\])/;
const BACKSLASH = 0x5c;
const QUESTION_MARK = 0x3f;
const NUMBER_SIGN = 0x23;
const LAST_C0_CONTROL = 0x1f;
const DELETE = 0x7f;

// The URL parser drops tabs and newlines anywhere, so the first '?' or '#' only
// marks where the path ends while control characters stay rejected everywhere.
function hasBackslashInLocationOrControlCharacter(value: string): boolean {
  let inQueryOrHash = false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= LAST_C0_CONTROL || code === DELETE) {
      return true;
    }
    if (code === QUESTION_MARK || code === NUMBER_SIGN) {
      inQueryOrHash = true;
    } else if (code === BACKSLASH && !inQueryOrHash) {
      return true;
    }
  }
  return false;
}

function toSameOriginPath(url: URL): string {
  return url.pathname.replace(/\/+/g, '/') + url.search + url.hash;
}

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

  if (hasBackslashInLocationOrControlCharacter(trimmed)) {
    logger.warn({ url: trimmed }, 'Blocked redirect with backslash or control character');
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
      const path = toSameOriginPath(u);
      return SINGLE_LEADING_SLASH.test(path) ? path : fallback;
    } catch {
      return fallback;
    }
  }

  try {
    const parsedUrl = new URL(trimmed, origin);
    const parsedOrigin = new URL(origin);

    if (parsedUrl.host === parsedOrigin.host || ALLOWED_HOSTS.has(parsedUrl.host)) {
      const path = toSameOriginPath(parsedUrl);
      if (SINGLE_LEADING_SLASH.test(path)) {
        return path;
      }
      logger.warn({ url: trimmed }, 'Blocked redirect resolving to a non-local path');
      return fallback;
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
