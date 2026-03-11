import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

function verifyDiagnosticSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'];

  // In production, CRON_SECRET is required
  if (!cronSecret) {
    const isProduction = process.env['NODE_ENV'] === 'production';
    if (isProduction) {
      logger.error('CRON_SECRET not set in production - denying diagnostic request');
      return false;
    }
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  if (!verifyDiagnosticSecret(request)) {
    logger.warn('Unauthorized webhook-diagnostic request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const host = request.headers.get('host') || 'unknown';

  // Check environment configuration (DO NOT expose actual keys)
  // AUDIT-P3-008-011: Mask supabaseUrl to prevent info disclosure
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  let maskedSupabaseUrl = 'NOT_SET';
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      maskedSupabaseUrl = url.hostname; // Only show domain, not full URL
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
