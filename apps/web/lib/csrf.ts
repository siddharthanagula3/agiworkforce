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

const CSRF_HEADER = 'x-csrf-token';
const _CSRF_COOKIE = 'csrf-token'; // Currently unused, kept for potential future use

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

  const parts = token.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [tokenSessionId, timestamp, signature] = parts;

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

  // Both signatures should be same length (hex of SHA256 = 64 chars)
  if (signature.length !== expectedSignature.length) {
    return false;
  }

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

  // Option 3: Generate unique anonymous session ID
  // NOTE: Each request without session gets a new ID, which means
  // anonymous users need to use cookies for CSRF to work properly
  return `anon-${crypto.randomUUID()}`;
}

/**
 * Validate CSRF token from request
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
