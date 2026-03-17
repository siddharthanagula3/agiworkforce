import { createHmac, timingSafeEqual } from 'crypto';
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
 * verified user ID — this is more secure than parsing raw cookie bytes since
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

  // Option 2: Cookie-based fallback for anonymous users
  const cookies = _request.headers.get('cookie') || '';

  // Check for explicit session cookie
  const sessionMatch = cookies.match(/session-id=([^;]+)/);
  if (sessionMatch?.[1]) {
    return sessionMatch[1];
  }

  // Check for existing anonymous session ID cookie to preserve CSRF binding.
  const anonMatch = cookies.match(/anon-session-id=([^;]+)/);
  if (anonMatch?.[1]) {
    return anonMatch[1];
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
 * CSRF tokens for anonymous users — it ensures the session ID is stable across
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

  // Option 2: Prefer authenticated session cookies (no new cookie needed)
  const sessionMatch = cookies.match(/session-id=([^;]+)/);
  if (sessionMatch?.[1]) {
    return { id: sessionMatch[1] };
  }

  // Option 3: Existing anonymous session cookie
  const anonMatch = cookies.match(/anon-session-id=([^;]+)/);
  if (anonMatch?.[1]) {
    return { id: anonMatch[1] };
  }

  // Option 4: Generate a new anonymous session ID and request it be stored in a cookie
  const anonId = `anon-${crypto.randomUUID()}`;
  return {
    id: anonId,
    newCookie: `anon-session-id=${anonId}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`,
  };
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

  // Bearer token requests are not vulnerable to CSRF — skip validation.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return true;
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

  // CSRF is a browser-session attack vector. Bearer token requests (e.g. from
  // the native desktop app) are not vulnerable to CSRF because an attacker
  // cannot read the token from a cross-origin context. Skip CSRF validation
  // when the request is authenticated via Bearer token.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return null;
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
