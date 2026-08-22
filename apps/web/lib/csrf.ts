import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { auth } from '@clerk/nextjs/server';

const MIN_CSRF_SECRET_BYTES = 32;
let cachedSecret: string | null = null;
let cachedPrevSecret: string | null | undefined = undefined;

function assertSufficientEntropy(name: string, value: string): void {
  if (Buffer.byteLength(value, 'utf8') < MIN_CSRF_SECRET_BYTES) {
    throw new Error(
      `${name} must be at least ${MIN_CSRF_SECRET_BYTES} bytes (UTF-8) · got ${Buffer.byteLength(value, 'utf8')}`,
    );
  }
}

function getCsrfSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }
  const secret = process.env['CSRF_SECRET'];
  if (!secret) {
    console.error(
      '[csrf] CRITICAL: CSRF_SECRET environment variable is not set. ' +
        'Cookie-session CSRF protection is DISABLED. ' +
        'Set CSRF_SECRET (≥32 bytes) in your Vercel/environment config. ' +
        'Bearer-authenticated requests (web app) are unaffected.',
    );
    cachedSecret = randomBytes(32).toString('hex');
    return cachedSecret;
  }
  assertSufficientEntropy('CSRF_SECRET', secret);
  cachedSecret = secret;
  return cachedSecret;
}

function getCsrfSecretPrev(): string | null {
  if (cachedPrevSecret !== undefined) return cachedPrevSecret;
  const prev = process.env['CSRF_SECRET_PREV'];
  if (!prev) {
    cachedPrevSecret = null;
    return null;
  }
  assertSufficientEntropy('CSRF_SECRET_PREV', prev);
  cachedPrevSecret = prev;
  return cachedPrevSecret;
}

/**
 * Reset the cached CSRF secret (for testing only)
 * @internal
 */
export function resetCsrfCache(): void {
  cachedSecret = null;
  cachedPrevSecret = undefined;
}

const CSRF_HEADER = 'x-csrf-token';

/**
 * Read a single cookie value by name from a Cookie header string.
 *
 * SECURITY (web-HIGH-1, audit 2026-05-05): the previous implementation called
 * `cookies.match(/<name>=([^;]+)/)` with no leading anchor. That regex matches
 * any cookie whose name *ends with* the target · so `x-anon-session-id=evil;
 * anon-session-id=real` returned `evil` (the leftmost match), and an attacker
 * who could plant `crafted-anon-session-id=<known>` via subdomain cookie
 * injection could forge any user's CSRF binding by pre-seeding the value.
 * The fix anchors the match to a cookie-name boundary `(?:^|; )` so the
 * pattern only matches a true cookie name. The cookie-name argument is
 * regex-escaped before interpolation so a caller passing a name with `.`
 * or `*` does not accidentally widen the match.
 *
 * Exported for unit-test access. Treat as internal · production code in this
 * file should be the only consumer.
 *
 * @internal
 */
export function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|; )${escaped}=([^;]+)`));
  return match?.[1] ?? null;
}

export function generateCsrfToken(sessionId: string): string {
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = createHmac('sha256', getCsrfSecret()).update(data).digest('hex');
  return `${data}:${signature}`;
}

export function verifyCsrfToken(
  token: string | null,
  sessionId: string,
  maxAge = 3600000,
): boolean {
  if (!token) {
    return false;
  }

  const lastColon = token.lastIndexOf(':');
  const secondLastColon = token.lastIndexOf(':', lastColon - 1);
  if (lastColon === -1 || secondLastColon === -1 || secondLastColon === lastColon) {
    return false;
  }
  const tokenSessionId = token.slice(0, secondLastColon);
  const timestamp = token.slice(secondLastColon + 1, lastColon);
  const signature = token.slice(lastColon + 1);

  if (tokenSessionId !== sessionId) {
    return false;
  }

  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime) || Date.now() - tokenTime > maxAge) {
    return false;
  }

  const data = `${tokenSessionId}:${timestamp}`;

  const currentMatch = constantTimeSignatureMatch(data, signature, getCsrfSecret());
  if (currentMatch) return true;
  const prev = getCsrfSecretPrev();
  if (prev) {
    return constantTimeSignatureMatch(data, signature, prev);
  }
  return false;
}

function constantTimeSignatureMatch(
  data: string,
  providedSignature: string,
  secret: string,
): boolean {
  const expectedSignature = createHmac('sha256', secret).update(data).digest('hex');
  const providedHash = createHmac('sha256', secret).update(providedSignature).digest();
  const expectedHash = createHmac('sha256', secret).update(expectedSignature).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function getSessionIdFromRequest(_request: Request): Promise<string> {
  try {
    const { userId } = await auth();
    if (userId) {
      return userId;
    }
  } catch {
    // Clerk may fail in non-route-handler contexts; fall through
  }

  const cookies = _request.headers.get('cookie') || '';

  const sessionId = readCookie(cookies, 'session-id');
  if (sessionId) {
    return sessionId;
  }

  const hostPrefixed = readCookie(cookies, '__Host-anon-session-id');
  if (hostPrefixed) {
    return hostPrefixed;
  }

  return `anon-${crypto.randomUUID()}`;
}

export async function getOrCreateAnonSession(
  request: Request,
): Promise<{ id: string; newCookie?: string }> {
  try {
    const { userId } = await auth();
    if (userId) {
      return { id: userId };
    }
  } catch {
    // Clerk may fail in non-route-handler contexts; fall through
  }

  const cookies = request.headers.get('cookie') || '';

  const sessionId = readCookie(cookies, 'session-id');
  if (sessionId) {
    return { id: sessionId };
  }

  const hostPrefixed = readCookie(cookies, '__Host-anon-session-id');
  if (hostPrefixed) {
    return { id: hostPrefixed };
  }

  const anonId = `anon-${crypto.randomUUID()}`;
  return {
    id: anonId,
    newCookie: `__Host-anon-session-id=${anonId}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`,
  };
}

async function isBearerTokenValid(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  if (token.length < 20 || token.length > 4096) {
    return false;
  }

  if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) {
    try {
      const { ApiKeyService } = await import('@/lib/services/api-key-service');
      const apiKey = await ApiKeyService.verifyKey(token);
      return apiKey !== null;
    } catch {
      return false;
    }
  }

  const { verifyDeveloperTokenSignature } = await import('@/lib/server/developer-token');
  if (verifyDeveloperTokenSignature(token)) {
    return true;
  }

  const secretKey = process.env['CLERK_SECRET_KEY'];
  if (!secretKey) return false;

  try {
    const { getClerkAuthorizedParties } = await import('@/lib/clerk-authorized-parties');
    const authorizedParties = getClerkAuthorizedParties();
    const { verifyToken } = await import('@clerk/backend');
    const claims = await verifyToken(token, { secretKey, authorizedParties });
    if (claims.sub) return true;
  } catch {
    // Not a valid Clerk token
  }

  return false;
}

export async function validateCsrfFromRequest(
  request: Request,
  sessionId?: string,
): Promise<boolean> {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const validBearer = await isBearerTokenValid(authHeader);
    if (validBearer) {
      return true;
    }
    // Invalid Bearer + possible session cookie · fall through to CSRF token check
  }

  const token = request.headers.get(CSRF_HEADER);
  const sid = sessionId || (await getSessionIdFromRequest(request));

  return verifyCsrfToken(token, sid);
}

/**
 * AUDIT-008-006: Validate CSRF token and return error response if invalid
 *
 * Use this at the start of state-changing handlers (POST, PUT, DELETE).
 * Returns null if CSRF validation passes, or a 403 Response if it fails.
 *
 * @example
 * const csrfError = await requireCsrfToken(request);
 * if (csrfError) return csrfError;
 */
export async function requireCsrfToken(
  request: Request,
  sessionId?: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const validBearer = await isBearerTokenValid(authHeader);
    if (validBearer) {
      return null;
    }
    // Invalid Bearer falls through to CSRF token check
  }

  const token = request.headers.get(CSRF_HEADER);
  const sid = sessionId || (await getSessionIdFromRequest(request));

  if (!verifyCsrfToken(token, sid)) {
    return new Response(
      JSON.stringify({
        error: 'Invalid or missing CSRF token',
        code: 'CSRF_VALIDATION_FAILED',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  return null;
}

export { isBearerTokenValid };
