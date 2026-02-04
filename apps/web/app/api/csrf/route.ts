import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { generateCsrfToken, getSessionIdFromRequest } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

/**
 * GET endpoint to generate CSRF tokens for authenticated users
 *
 * Returns a CSRF token that must be included in the x-csrf-token header
 * for all state-changing requests (POST, PUT, DELETE).
 */
async function handleGetCsrfToken(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Generate session ID - prefer user ID if authenticated, otherwise use cookie-based session
    const sessionId = session?.user?.id || getSessionIdFromRequest(request);

    // Generate CSRF token
    const token = generateCsrfToken(sessionId);

    logger.info(
      {
        sessionId: session?.user?.id ? 'authenticated' : 'anonymous',
        timestamp: new Date().toISOString(),
      },
      'CSRF token generated',
    );

    return NextResponse.json({
      token,
      expiresIn: 3600000, // 1 hour in milliseconds
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate CSRF token');
    // Return a generic error without exposing internal details
    return NextResponse.json({ error: 'Failed to generate CSRF token' }, { status: 500 });
  }
}

export const GET = withErrorHandler(handleGetCsrfToken);
