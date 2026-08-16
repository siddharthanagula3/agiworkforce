import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { generateCsrfToken, getOrCreateAnonSession } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

async function handleGetCsrfToken(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = await withRateLimit(request, 'default');
    if (rateLimitResponse) return rateLimitResponse;

    const { id: sessionId, newCookie } = await getOrCreateAnonSession(request);

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

    if (newCookie) {
      response.headers.set('Set-Cookie', newCookie);
    }

    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to generate CSRF token');
    return NextResponse.json({ error: 'Failed to generate CSRF token' }, { status: 500 });
  }
}

export const GET = withErrorHandler(handleGetCsrfToken);
