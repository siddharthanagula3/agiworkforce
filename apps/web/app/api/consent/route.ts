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
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  isNonEssentialConsentPurpose,
  readGlobalPrivacyControlHeader,
} from '@/lib/consent-signals';

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

  const { userId } = await getClerkAuthUser(request);

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

  const { userId } = await getClerkAuthUser(request);

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

  // A browser sending Global Privacy Control has refused every purpose that is
  // not needed to serve it, so a grant for one is recorded as the refusal it is.
  const optedOut = readGlobalPrivacyControlHeader(request.headers);
  const decisions = parsed.data.decisions.map((decision) => ({
    purpose: decision.purpose,
    granted: optedOut && isNonEssentialConsentPurpose(decision.purpose) ? false : decision.granted,
  }));

  try {
    const written = await recordConsentBatch(
      { kind: 'user', userId },
      decisions,
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
