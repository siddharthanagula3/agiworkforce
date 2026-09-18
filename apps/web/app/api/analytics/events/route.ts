import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  PRODUCT_ANALYTICS_MAX_BATCH,
  normalizeProductAnalyticsEvent,
  type ProductAnalyticsEvent,
} from '@agiworkforce/types';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isProductAnalyticsAllowed,
  recordProductAnalyticsEvents,
} from '@/lib/server/product-analytics';

const IngestSchema = z.object({
  events: z.array(z.unknown()).min(1).max(PRODUCT_ANALYTICS_MAX_BATCH),
});

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await getUserScopedDb(request);

  const parsed = IngestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid analytics payload', parsed.error.flatten());
  }

  if (!(await isProductAnalyticsAllowed(userId))) {
    return NextResponse.json({ accepted: 0, consent: 'withheld' }, { status: 202 });
  }

  const events: ProductAnalyticsEvent[] = [];
  let rejected = 0;
  for (const candidate of parsed.data.events) {
    const event = normalizeProductAnalyticsEvent(candidate);
    if (event) events.push(event);
    else rejected += 1;
  }

  const accepted = await recordProductAnalyticsEvents({ userId, organizationId }, events);

  return NextResponse.json({ accepted, rejected, consent: 'granted' });
}

export const POST = withErrorHandler(handlePost);
