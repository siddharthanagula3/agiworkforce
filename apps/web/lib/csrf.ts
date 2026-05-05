import { createHmac, timingSafeEqual } from 'crypto';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

// Lazily get CSRF_SECRET to avoid errors during build/static generation
let cachedSecret: string | null = null;

function getCsrfSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }
  const secret = process.env['CSRF_SECRET'];
  if (!secret) {
    throw new Error('CSRF_SECRET environment variable is required');
  }
  cachedSecret = secret;
  return cachedSecret;
}

/**
 * Reset the cached CSRF secret (for testing only)
 * @internal
 */
export function resetCsrfCache(): void {
  cachedSecret = null;
}

const CSRF_HEADER = 'x-csrf-token';
// Cookie name reserved for future CSRF implementation: 'csrf-token'

/**
 * Read a single cookie value by name from a Cookie header string.
 *
 * SECURITY (web-HIGH-1, audit 2026-05-05): the previous implementation called
 * `cookies.match(/<name>=([^;]+)/)` with no leading anchor. That regex matches
 * any cookie whose name *ends with* the target — so `x-anon-session-id=evil;
 * anon-session-id=real` returned `evil` (the leftmost match), and an attacker
 * who could plant `crafted-anon-session-id=<known>` via subdomain cookie
 * injection could forge any user's CSRF binding by pre-seeding the value.
 * The fix anchors the match to a cookie-name boundary `(?:^|; )` so the
 * pattern only matches a true cookie name. The cookie-name argument is
 * regex-escaped before interpolation so a caller passing a name with `.`
 * or `*` does not accidentally widen the match.
 *
 * Exported for unit-test access. Treat as internal — production code in this
 * file should be the only consumer.
 *
 * @internal
 */
export function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|; )${escaped}=([^;]+)`));
  return match?.[1] ?? null;
}

/**
 * Generate a CSRF token
 * In production, tokens should be session-specific and time-limited
 */
export function generateCsrfToken(sessionId: string): string {
  const timestamp = Date.now().toString();
  const data = `${sessionId}:${timestamp}`;
  const signature = createHmac('sha256', getCsrfSecret()).update(data).digest('hex');
  return `${data}:${signature}`;
}

/**
 * Verify a CSRF token
 * Tokens are valid for 1 hour by default
 */
export function verifyCsrfToken(
  token: string | null,
  sessionId: string,
  maxAge = 3600000,
): boolean {
  if (!token) {
    return false;
  }

  // Parse from the right so sessionIds containing colons are handled correctly.
  // timestamp is always a numeric string (no colons); signature is always hex (no colons).
  // Only sessionId may contain colons, so we find the last two delimiters from the right.
  const lastColon = token.lastIndexOf(':');
  const secondLastColon = token.lastIndexOf(':', lastColon - 1);
  if (lastColon === -1 || secondLastColon === -1 || secondLastColon === lastColon) {
    return false;
  }
  const tokenSessionId = token.slice(0, secondLastColon);
  const timestamp = token.slice(secondLastColon + 1, lastColon);
  const signature = token.slice(lastColon + 1);

  // Verify session ID matches
  if (tokenSessionId !== sessionId) {
    return false;
  }

  // Verify token age
  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime) || Date.now() - tokenTime > maxAge) {
    return false;
  }

  // Verify signature using constant-time comparison to prevent timing attacks.
  const data = `${tokenSessionId}:${timestamp}`;
  const expectedSignature = createHmac('sha256', getCsrfSecret()).update(data).digest('hex');

  // Hash both values to a fixed-length digest before comparing.
  // This ensures timingSafeEqual always receives equal-length buffers,
  // eliminating the timing side channel from the try/catch that previously
  // caught length-mismatch exceptions (distinguishable from normal comparison).
  const hmacKey = getCsrfSecret();
  const providedHash = createHmac('sha256', hmacKey).update(signature).digest();
  const expectedHash = createHmac('sha256', hmacKey).update(expectedSignature).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

/**
 * Extract session ID from request.
 *
 * M3 FIX: For authenticated users, uses the Supabase server client to get the
 * verified user ID - this is more secure than parsing raw cookie bytes since
 * the user ID is verified through Supabase Auth, not derived from untrusted
 * cookie values.
 *
 * Falls back to cookie-based session binding for anonymous users.
 *
 * NOTE: For anonymous users this reads the `anon-session-id` cookie before
 * generating a new UUID. This ensures CSRF tokens generated on one request can
 * be verified on subsequent requests for the same anonymous session.
 * Use `getOrCreateAnonSession(request)` in route handlers that need to set the
 * cookie when one does not already exist.
 */
export async function getSessionIdFromRequest(_request: Request): Promise<string> {
  // Option 1 (preferred): Use Supabase server client to get verified user ID
  // This avoids parsing raw cookie bytes and ensures the session ID is
  // cryptographically verified through Supabase Auth.
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      return user.id;
    }
  } catch {
    // Supabase client may fail in non-route-handler contexts; fall through
  }

  // Option 2: Cookie-based fallback for anonymous users.
  // All cookie reads below go through readCookie() which anchors to the
  // cookie-name boundary — see web-HIGH-1 fix at the helper definition.
  const cookies = _request.headers.get('cookie') || '';

  const sessionId = readCookie(cookies, 'session-id');
  if (sessionId) {
    return sessionId;
  }

  // SEV-WEB-M-1 fix (2026-05-05): prefer the `__Host-` prefixed cookie which
  // the browser refuses to set from JavaScript or from sibling subdomains.
  // Fall back to the legacy `anon-session-id` for one Max-Age window (24h)
  // so existing visitors don't lose their CSRF binding mid-session, then
  // remove the fallback in a follow-up commit after 2026-05-06.
  const hostPrefixed = readCookie(cookies, '__Host-anon-session-id');
  if (hostPrefixed) {
    return hostPrefixed;
  }
  const anonId = readCookie(cookies, 'anon-session-id');
  if (anonId) {
    return anonId;
  }

  // Option 3: Generate unique anonymous session ID
  // NOTE: Each request without any session gets a new ID.
  // Use getOrCreateAnonSession() in route handlers to persist this via cookie.
  return `anon-${crypto.randomUUID()}`;
}

/**
 * Get or create an anonymous session ID for the request.
 *
 * Returns `{ id }` when an existing session is found, or `{ id, newCookie }`
 * when a new anonymous session ID has been generated and should be persisted.
 * Route handlers should set `Set-Cookie: newCookie` on their response when present.
 *
 * This is the preferred function to use in route handlers that need to generate
 * CSRF tokens for anonymous users - it ensures the session ID is stable across
 * the token-generation request and subsequent validation requests.
 */
export async function getOrCreateAnonSession(
  request: Request,
): Promise<{ id: string; newCookie?: string }> {
  // Option 1 (preferred): Use Supabase server client for verified user ID
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      return { id: user.id };
    }
  } catch {
    // Fall through to cookie-based fallback
  }

  const cookies = request.headers.get('cookie') || '';

  // Option 2: Prefer authenticated session cookies (no new cookie needed).
  // All cookie reads use the anchored readCookie helper — see web-HIGH-1.
  const sessionId = readCookie(cookies, 'session-id');
  if (sessionId) {
    return { id: sessionId };
  }

  // Option 3a: New `__Host-` prefixed cookie (SEV-WEB-M-1 fix, 2026-05-05).
  // The `__Host-` prefix forces Path=/ + Secure + no Domain, and the browser
  // refuses to set such a cookie from JavaScript or from a sibling subdomain
  // — closing the cross-subdomain CSRF-binding hijack vector.
  const hostPrefixed = readCookie(cookies, '__Host-anon-session-id');
  if (hostPrefixed) {
    return { id: hostPrefixed };
  }
  // Option 3b: Legacy cookie (transitional — accept for 24h Max-Age window
  // so in-flight visitors don't lose CSRF binding; remove after 2026-05-06).
  const legacyAnonId = readCookie(cookies, 'anon-session-id');
  if (legacyAnonId) {
    return { id: legacyAnonId };
  }

  // Option 4: Generate a new anonymous session ID and request it be stored in a cookie
  const anonId = `anon-${crypto.randomUUID()}`;
  return {
    id: anonId,
    // `__Host-` requires Path=/, Secure, and no Domain attribute — all set.
    newCookie: `__Host-anon-session-id=${anonId}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`,
  };
}

/**
 * RT-04 fix: Validate a Bearer token cryptographically before granting CSRF bypass.
 *
 * The old code bypassed CSRF for ANY request with `Authorization: Bearer <anything>`,
 * including invalid/garbage tokens. This created a bypass window: an attacker could
 * add `Authorization: Bearer bogus` to a cross-origin request, skip CSRF, then let
 * auth fail later — leaving any endpoint that checked CSRF before auth vulnerable.
 *
 * Fix: Only bypass CSRF when the Bearer JWT is verified as belonging to a real Supabase
 * user. If verification fails, fall through to the CSRF token check as normal.
 *
 * Returns true if the token is valid (CSRF bypass is safe), false if invalid/missing.
 */
async function isBearerTokenValid(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  // Validate token length to avoid excessive work on garbage inputs
  if (token.length < 20 || token.length > 4096) {
    return false;
  }
  try {
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!supabaseUrl || !serviceKey) return false;

    const admin = createSupabaseAdminClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.getUser(token);
    return !error && !!data?.user;
  } catch {
    return false;
  }
}

/**
 * Validate CSRF token from request (returns boolean for backwards compatibility)
 */
export async function validateCsrfFromRequest(
  request: Request,
  sessionId?: string,
): Promise<boolean> {
  // Only validate for state-changing methods
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true; // GET requests don't need CSRF protection
  }

  // RT-04 fix: Only bypass CSRF when the Bearer token is cryptographically valid.
  // Previously ANY Bearer string (including `Bearer bogus`) bypassed CSRF — this
  // created a bypass for any endpoint checking CSRF before auth.
  // Threat model: a cross-origin page cannot forge a valid Bearer JWT (SOP blocks
  // reading localStorage / injecting Authorization on third-party requests), so a
  // valid JWT here means the request is from a legitimate client.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const validBearer = await isBearerTokenValid(authHeader);
    if (validBearer) {
      return true; // Legitimate Bearer auth — CSRF bypass is safe
    }
    // Invalid Bearer + possible session cookie — fall through to CSRF token check
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
  // Only validate for state-changing methods
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null; // GET requests don't need CSRF protection
  }

  // RT-04 fix: Only bypass CSRF when the Bearer token is cryptographically valid.
  // See isBearerTokenValid() for the threat model analysis.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const validBearer = await isBearerTokenValid(authHeader);
    if (validBearer) {
      return null; // Legitimate Bearer auth — CSRF bypass is safe
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

// Export for tests
export { isBearerTokenValid };
