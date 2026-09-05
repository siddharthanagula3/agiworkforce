import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  CONSENT_PURPOSES,
  CURRENT_NOTICE_VERSION,
  isConsentPurpose,
  isConsentSurface,
  readUserConsents,
  recordConsentBatch,
} from '@/lib/server/consent-records';
import { getRequestIdentity } from '@/lib/server/identity';

const ConsentDecisionSchema = z.object({
  purpose: z.string().refine(isConsentPurpose, 'Unknown consent purpose'),
  granted: z.boolean(),
});

const RecordConsentSchema = z.object({
  decisions: z.array(ConsentDecisionSchema).min(1).max(CONSENT_PURPOSES.length),
  surface: z.string().refine(isConsentSurface, 'Unknown consent surface'),
  noticeVersion: z.string().min(1).max(32),
});

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    throw createError.unauthorized('Sign in to read your consent record');
  }

  const records = await readUserConsents(userId);

  return NextResponse.json({
    noticeVersion: CURRENT_NOTICE_VERSION,
    purposes: CONSENT_PURPOSES,
    consents: records,
  });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    throw createError.unauthorized('Sign in to record a consent decision');
  }

  const parsed = RecordConsentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid consent payload', parsed.error.flatten());
  }

  if (parsed.data.noticeVersion !== CURRENT_NOTICE_VERSION) {
    return NextResponse.json(
      {
        error: {
          code: 'NOTICE_VERSION_OUTDATED',
          message: 'The privacy notice changed after this page loaded.',
        },
        currentNoticeVersion: CURRENT_NOTICE_VERSION,
      },
      { status: 409 },
    );
  }

  const seen = new Set<string>();
  for (const decision of parsed.data.decisions) {
    if (seen.has(decision.purpose)) {
      throw createError.validation(`Conflicting decisions for purpose ${decision.purpose}`);
    }
    seen.add(decision.purpose);
  }

  try {
    const written = await recordConsentBatch(
      { kind: 'user', userId },
      parsed.data.decisions,
      parsed.data.surface,
    );
    return NextResponse.json({ recorded: written, noticeVersion: CURRENT_NOTICE_VERSION });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to record consent decision');
    throw createError.internal('Failed to record your consent decision');
  }
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
