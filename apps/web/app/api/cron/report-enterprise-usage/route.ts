import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { STRIPE_CLIENT_OPTIONS } from '@/lib/stripe-config';
import { reportEnterpriseOverageUsage } from '@/lib/services/enterprise-usage-metering';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripeKey = process.env['STRIPE_SECRET_KEY'];
  if (!stripeKey) {
    logger.warn('STRIPE_SECRET_KEY is not set; enterprise overage reporting was skipped');
    return NextResponse.json({
      message: 'Enterprise overage reporting skipped: Stripe is not configured',
      results: [],
    });
  }

  const results = await reportEnterpriseOverageUsage({
    db: getNeonDb(),
    stripe: new Stripe(stripeKey, STRIPE_CLIENT_OPTIONS),
  });

  const failed = results.filter((result) => result.status === 'failed').length;
  const reported = results.filter((result) => result.status === 'reported').length;

  logger.info(
    { examined: results.length, reported, failed },
    'Enterprise overage reporting completed',
  );

  return NextResponse.json(
    { message: 'Enterprise overage reporting completed', results },
    { status: failed > 0 && failed === results.length ? 500 : 200 },
  );
}
