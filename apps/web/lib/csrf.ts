import { createHmac, timingSafeEqual } from 'crypto';

// Lazily get CSRF_SECRET to avoid errors during build/static generation
let cachedSecret: string | null = null;

function getCsrfSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }
  const secret = process.env.CSRF_SECRET;
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

  // Verify signature using constant-time comparison to prevent timing attacks
  const data = `${tokenSessionId}:${timestamp}`;
  const expectedSignature = createHmac('sha256', getCsrfSecret()).update(data).digest('hex');

  // Do NOT length-check before timingSafeEqual — a pre-check creates a timing side channel.
  // timingSafeEqual throws for unequal-length buffers, which the catch below handles.
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Extract session ID from request cookies.
 *
 * SECURITY NOTE: This function does NOT extract from JWT headers because
 * JWT verification must happen through proper auth middleware (Supabase Auth).
 * Callers with authenticated users should pass the verified user ID directly
 * to validateCsrfFromRequest() instead of relying on this fallback.
 *
 * NOTE: For anonymous users this now reads the `anon-session-id` cookie before
 * generating a new UUID. This ensures CSRF tokens generated on one request can
 * be verified on subsequent requests for the same anonymous session.
 * Use `getOrCreateAnonSession(request)` in route handlers that need to set the
 * cookie when one does not already exist.
 */
export function getSessionIdFromRequest(request: Request): string {
  // Option 1: Get from session cookie
  const cookies = request.headers.get('cookie') || '';
  const sessionMatch = cookies.match(/session-id=([^;]+)/);
  if (sessionMatch) {
    return sessionMatch[1];
  }

  // Option 2: Get Supabase auth cookie for session binding
  // The sb-*-auth-token cookie is set by Supabase and contains verified session info
  const supabaseAuthMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (supabaseAuthMatch) {
    // Use a hash of the cookie value to avoid exposing the raw token
    const tokenHash = createHmac('sha256', getCsrfSecret())
      .update(supabaseAuthMatch[1])
      .digest('hex')
      .substring(0, 32);
    return `session-${tokenHash}`;
  }

  // Option 2.5: Use an existing anonymous session ID cookie to preserve CSRF binding.
  // This is the key fix for anonymous users: reuse the same session ID across requests
  // instead of generating a new one per-request (which broke CSRF validation).
  const anonMatch = cookies.match(/anon-session-id=([^;]+)/);
  if (anonMatch) {
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
export function getOrCreateAnonSession(request: Request): { id: string; newCookie?: string } {
  const cookies = request.headers.get('cookie') || '';

  // Option 1: Prefer authenticated session cookies (no new cookie needed)
  const sessionMatch = cookies.match(/session-id=([^;]+)/);
  if (sessionMatch) {
    return { id: sessionMatch[1] };
  }

  // Option 2: Supabase auth cookie (no new cookie needed)
  const supabaseAuthMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (supabaseAuthMatch) {
    const tokenHash = createHmac('sha256', getCsrfSecret())
      .update(supabaseAuthMatch[1])
      .digest('hex')
      .substring(0, 32);
    return { id: `session-${tokenHash}` };
  }

  // Option 3: Existing anonymous session cookie
  const anonMatch = cookies.match(/anon-session-id=([^;]+)/);
  if (anonMatch) {
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

  const token = request.headers.get(CSRF_HEADER);
  const sid = sessionId || getSessionIdFromRequest(request);

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

  const token = request.headers.get(CSRF_HEADER);
  const sid = sessionId || getSessionIdFromRequest(request);

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
