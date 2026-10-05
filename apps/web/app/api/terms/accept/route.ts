import { NextRequest, NextResponse } from 'next/server';
import {
  TermsAcceptanceRequestSchema,
  type TermsAcceptanceRequest,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  CURRENT_TERMS_VERSION,
  readTermsStanding,
  recordTermsAcceptance,
} from '@/lib/server/terms';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  isConsentSurface,
  MARKETING_EMAIL_CONSENT_PURPOSE,
  type ConsentSurface,
} from '@/lib/consent-purposes';
import {
  grantedUnderGlobalPrivacyControl,
  readGlobalPrivacyControlHeader,
} from '@/lib/consent-signals';
import {
  noticeVersionForPurpose,
  readLatestConsent,
  recordConsent,
} from '@/lib/server/consent-records';
import { trackProductAnalyticsEvent } from '@/lib/server/product-analytics';
import { attributeReferralFromRequest } from '@/lib/services/referral-attribution';

interface MarketingEmailGrant {
  surface: ConsentSurface;
  noticeVersion: string;
}

function readMarketingEmailGrant(payload: TermsAcceptanceRequest): MarketingEmailGrant | null {
  if (payload.marketingEmailNoticeVersion === undefined) return null;
  if (!isConsentSurface(payload.surface)) {
    throw createError.validation('This surface does not ask about marketing email', {
      surface: payload.surface,
    });
  }
  return { surface: payload.surface, noticeVersion: payload.marketingEmailNoticeVersion };
}

// The box is only ever shown to an account with no decision, so one that
// exists was made after it: a request repeated past a withdrawal must not
// turn the email back on.
async function hasNoMarketingEmailDecision(userId: string): Promise<boolean> {
  return (await readLatestConsent(userId, MARKETING_EMAIL_CONSENT_PURPOSE.id)) === null;
}

async function handleAcceptTerms(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const { userId } = await getClerkAuthUser(request);

  const parsed = TermsAcceptanceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid terms acceptance payload', parsed.error.flatten());
  }
  const marketingEmail = readMarketingEmailGrant(parsed.data);
  if (parsed.data.version !== CURRENT_TERMS_VERSION) {
    return NextResponse.json(
      {
        error: {
          code: 'TERMS_VERSION_OUTDATED',
          message: 'The Terms of Service changed after this page loaded.',
        },
        currentVersion: CURRENT_TERMS_VERSION,
      },
      { status: 409 },
    );
  }
  const currentNoticeVersion = noticeVersionForPurpose(MARKETING_EMAIL_CONSENT_PURPOSE.id);
  if (marketingEmail && marketingEmail.noticeVersion !== currentNoticeVersion) {
    return NextResponse.json(
      {
        error: {
          code: 'NOTICE_VERSION_OUTDATED',
          message: 'The privacy notice changed after this page loaded.',
        },
        currentNoticeVersion,
      },
      { status: 409 },
    );
  }

  try {
    const undecidedGrant =
      marketingEmail && (await hasNoMarketingEmailDecision(userId)) ? marketingEmail : null;
    const acceptance = await recordTermsAcceptance(userId, parsed.data.surface);
    if (undecidedGrant) {
      await recordConsent({
        subject: { kind: 'user', userId },
        purpose: MARKETING_EMAIL_CONSENT_PURPOSE.id,
        granted: grantedUnderGlobalPrivacyControl(
          { purpose: MARKETING_EMAIL_CONSENT_PURPOSE.id, granted: true },
          readGlobalPrivacyControlHeader(request.headers),
        ),
        surface: undecidedGrant.surface,
      });
    }
    if (parsed.data.surface === 'web-signup') {
      trackProductAnalyticsEvent({ userId }, { name: 'signup', surface: 'web' });
    }
    await attributeReferralFromRequest(request, userId);
    return NextResponse.json({
      version: acceptance.version,
      acceptedAt: acceptance.acceptedAt,
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to record terms acceptance');
    throw createError.internal('Failed to record terms acceptance');
  }
}

export const POST = withErrorHandler(handleAcceptTerms);

async function handleGetTerms(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);
  const standing = await readTermsStanding(userId);
  return NextResponse.json(
    { currentVersion: CURRENT_TERMS_VERSION, accepted: standing.kind !== 'required' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGetTerms);
