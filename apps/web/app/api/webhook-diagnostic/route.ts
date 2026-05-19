import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { requireAdmin } from '@/lib/auth-guards';
import { isAppError } from '@/lib/errors';

/**
 * Stripe webhook configuration probe — admin only.
 *
 * WEB-24 / WEB-26 (audit 2026-05-19): the previous shared `verifyDiagnosticSecret`
 * helper accepted any caller when `CRON_SECRET` was unset in a non-production
 * environment. Preview deploys often run with `NODE_ENV=production` but absent
 * secrets, and the duplicate `/api/validate-webhook` endpoint had a wider leak.
 * This endpoint now requires an admin app-metadata role; the duplicate has been
 * deleted. Cron-style probes should use a service-role JWT.
 *
 * Returns env-presence booleans + a masked Supabase host. Never returns raw
 * secret values.
 */
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

  // AUDIT-P3-008-011: Mask supabaseUrl to prevent info disclosure
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  let maskedSupabaseUrl = 'NOT_SET';
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      maskedSupabaseUrl = url.hostname;
    } catch {
      maskedSupabaseUrl = 'INVALID_URL';
    }
  }

  const config = {
    environment: process.env['NODE_ENV'],
    host,
    hasStripeKey: !!process.env['STRIPE_SECRET_KEY'],
    hasStripeWebhookSecret: !!process.env['STRIPE_WEBHOOK_SECRET'],
    hasSupabaseUrl: !!supabaseUrl,
    hasSupabaseServiceKey: !!process.env['SUPABASE_SERVICE_ROLE_KEY'],
    supabaseHost: maskedSupabaseUrl,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(config);
}
