import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
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

/**
 * GET  /api/consent — the signed-in user's live consent state, per purpose.
 * POST /api/consent — record one or more consent decisions.
 *
 * This is the withdrawal path as much as the granting path. DPDP s.6(6)
 * requires withdrawing consent to be as easy as giving it, so both directions
 * go through the same route with the same cost: a `granted: false` decision is
 * an ordinary POST, not a support ticket. The consent centre at
 * `/privacy/requests` is the caller.
 *
 * Both a grant and a withdrawal are appended to the ledger — see
 * `lib/server/consent-records.ts` for why nothing here updates in place.
 *
 * Anonymous consent (a visitor with no account) is NOT accepted here. It is
 * collected inline by the intake that needs it — `/api/waitlist/public` — so a
 * consent row can never exist for an address that was never submitted.
 */

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

  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized('Sign in to read your consent record');
  }

  const records = await readUserConsents(userId);

  return NextResponse.json({
    noticeVersion: CURRENT_NOTICE_VERSION,
    // The catalogue travels with the state so the client never hardcodes a
    // purpose list that could drift from the one the server accepts.
    purposes: CONSENT_PURPOSES,
    // A purpose absent from this array has never been decided. That is not the
    // same as a recorded refusal, and the client must not render it as one.
    consents: records,
  });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  // `requireCsrfToken` is typed to the web `Response`; every route in this app
  // narrows it the same way rather than widening its own return type.
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized('Sign in to record a consent decision');
  }

  const parsed = RecordConsentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid consent payload', parsed.error.flatten());
  }

  // A stale tab must not be able to record consent against a notice revision
  // the person never saw. 409 tells the client to reload the notice and ask
  // again rather than silently binding them to newer text.
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
