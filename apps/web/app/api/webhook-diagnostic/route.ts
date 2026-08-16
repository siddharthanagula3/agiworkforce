import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { requireAdmin } from '@/lib/auth-guards';
import { isAppError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await requireAdmin(request);
  } catch (err) {
    if (isAppError(err)) {
      logger.warn(
        { code: err.code, status: err.statusCode },
        'Unauthorized webhook-diagnostic request',
      );
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err }, 'Unexpected error in webhook-diagnostic auth');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const host = request.headers.get('host') || 'unknown';

  const config = {
    environment: process.env['NODE_ENV'],
    host,
    hasStripeKey: !!process.env['STRIPE_SECRET_KEY'],
    hasStripeWebhookSecret: !!process.env['STRIPE_WEBHOOK_SECRET'],
    hasClerkPublishableKey: !!process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'],
    hasClerkSecretKey: !!process.env['CLERK_SECRET_KEY'],
    hasDatabaseUrl: !!process.env['DATABASE_URL'],
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(config);
}
