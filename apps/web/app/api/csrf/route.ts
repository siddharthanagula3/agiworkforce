import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { generateCsrfToken, getOrCreateAnonSession } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

/**
 * GET endpoint to generate CSRF tokens for authenticated users
 *
 * Returns a CSRF token that must be included in the x-csrf-token header
 * for all state-changing requests (POST, PUT, DELETE).
 */
async function handleGetCsrfToken(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = await withRateLimit(request, 'default');
    if (rateLimitResponse) return rateLimitResponse;
    // Note: We intentionally skip getSession()/getUser() here — the CSRF token is bound to
    // the anonymous session from getOrCreateAnonSession(), not the Supabase auth session.
    // This avoids an unnecessary round-trip for anonymous visitors requesting CSRF tokens.

    // Use cookie-derived session binding so all endpoints that call requireCsrfToken(request)
    // validate against the same session identifier.
    // getOrCreateAnonSession() returns a stable session ID and a Set-Cookie value when a new
    // anonymous session has been created, ensuring CSRF tokens are usable across requests.
    const { id: sessionId, newCookie } = await getOrCreateAnonSession(request);

    // Generate CSRF token
    const token = generateCsrfToken(sessionId);

    logger.info(
      {
        sessionType: sessionId ? 'bound' : 'anonymous',
        timestamp: new Date().toISOString(),
      },
      'CSRF token generated',
    );

    const response = NextResponse.json({
      token,
      expiresIn: 3600000, // 1 hour in milliseconds
    });

    // If a new anonymous session cookie was generated, set it on the response so
    // subsequent CSRF validation calls can retrieve the same session ID.
    if (newCookie) {
      response.headers.set('Set-Cookie', newCookie);
    }

    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to generate CSRF token');
    // Return a generic error without exposing internal details
    return NextResponse.json({ error: 'Failed to generate CSRF token' }, { status: 500 });
  }
}

export const GET = withErrorHandler(handleGetCsrfToken);
