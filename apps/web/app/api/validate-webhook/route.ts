import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

function verifyDiagnosticSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is required
  if (!cronSecret) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      logger.error('CRON_SECRET not set in production - denying diagnostic request');
      return false;
    }
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Validation endpoint to check webhook configuration
 * This endpoint helps verify that all required environment variables are set
 * and the webhook is properly configured
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  if (!verifyDiagnosticSecret(request)) {
    logger.warn('Unauthorized validate-webhook request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const checks = {
      stripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };

    const allConfigured = Object.values(checks).every((v) => v === true);

    // Check if secrets are in correct format (without exposing them)
    const stripeSecretKeyFormat =
      checks.stripeSecretKey && process.env.STRIPE_SECRET_KEY?.startsWith('sk_');
    const webhookSecretFormat =
      checks.stripeWebhookSecret && process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_');

    const issues: string[] = [];
    if (!checks.stripeSecretKey) issues.push('STRIPE_SECRET_KEY is not set');
    if (!checks.stripeWebhookSecret) issues.push('STRIPE_WEBHOOK_SECRET is not set');
    if (!checks.supabaseUrl) issues.push('NEXT_PUBLIC_SUPABASE_URL is not set');
    if (!checks.supabaseServiceRoleKey) issues.push('SUPABASE_SERVICE_ROLE_KEY is not set');
    if (checks.stripeSecretKey && !stripeSecretKeyFormat)
      issues.push('STRIPE_SECRET_KEY format is invalid (should start with sk_)');
    if (checks.stripeWebhookSecret && !webhookSecretFormat)
      issues.push('STRIPE_WEBHOOK_SECRET format is invalid (should start with whsec_)');

    return NextResponse.json(
      {
        status: allConfigured && stripeSecretKeyFormat && webhookSecretFormat ? 'ok' : 'error',
        configured: allConfigured,
        checks: {
          ...checks,
          stripeSecretKeyFormat,
          webhookSecretFormat,
        },
        issues: issues.length > 0 ? issues : undefined,
        webhookEndpoint: `${process.env.NEXT_PUBLIC_APP_URL || 'https://agiworkforce.com'}/api/stripe-webhook`,
        message: allConfigured
          ? 'All webhook configuration checks passed'
          : 'Some webhook configuration checks failed',
      },
      { status: allConfigured ? 200 : 500 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
