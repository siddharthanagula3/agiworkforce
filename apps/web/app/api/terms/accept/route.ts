import { NextRequest, NextResponse } from 'next/server';
import {
  ADULT_ELIGIBILITY_ERROR_CODES,
  TermsAcceptanceRequestSchema,
  type AdultEligibilityState,
  type TermsAcceptanceRequest,
} from '@agiworkforce/cloud-contracts';
import { ACCOUNT_AGE_INELIGIBLE_MESSAGE } from '@agiworkforce/types';

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
  primaryEmailStateOf,
  readAccountForEmailCheck,
  UNCONFIRMED_EMAIL_MESSAGE,
} from '@/lib/auth/email-confirmation';
import { isNewAccount, SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS } from '@/lib/auth/new-account';
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
import {
  readAdultEligibilityState,
  submitAdultEligibilityEvidence,
} from '@/lib/server/adult-eligibility';
import { trackProductAnalyticsEvent } from '@/lib/server/product-analytics';
import { attributeReferralFromRequest } from '@/lib/services/referral-attribution';

const SIGN_UP_SURFACE = 'web-signup';
const NATIVE_SURFACE = 'mobile-auth';
const AGE_REFUSED_STATUS = 403;

/**
 * Evidence sent with the acceptance is judged first, on any surface. Without
 * it, a web acceptance still needs the account's 18 and over decision to be on
 * record: the web flows collect one before this call. The phone app reports its
 * evidence through the eligibility route, and builds released before that
 * route existed send none here, so their acceptance is recorded as before and
 * the Cloud gates are what hold them.
 */
async function adultEligibilityForAcceptance(
  userId: string,
  payload: TermsAcceptanceRequest,
): Promise<AdultEligibilityState> {
  if (payload.eligibility) {
    return submitAdultEligibilityEvidence(userId, payload.surface, payload.eligibility);
  }
  return payload.surface === NATIVE_SURFACE ? 'confirmed' : readAdultEligibilityState(userId);
}

function ageRefusal(state: Exclude<AdultEligibilityState, 'confirmed'>): NextResponse {
  return NextResponse.json(
    {
      error:
        state === 'ineligible'
          ? {
              code: ADULT_ELIGIBILITY_ERROR_CODES.ineligible,
              message: ACCOUNT_AGE_INELIGIBLE_MESSAGE,
            }
          : {
              code: ADULT_ELIGIBILITY_ERROR_CODES.confirmationRequired,
              message: 'Confirm your age before accepting the terms.',
            },
    },
    { status: AGE_REFUSED_STATUS },
  );
}

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

  const account = await readAccountForEmailCheck(userId);
  if (!primaryEmailStateOf(account).confirmed) {
    throw createError.forbidden(UNCONFIRMED_EMAIL_MESSAGE);
  }
  // The sign-up screen's agreement covers only the account that screen just
  // created. Any other account reviews the terms itself, on the sign-in surface.
  if (parsed.data.surface === SIGN_UP_SURFACE && !isNewAccount(account)) {
    return NextResponse.json(
      {
        error: {
          code: 'SIGN_UP_AGREEMENT_NOT_APPLICABLE',
          message: 'This account was not created by this sign-up. Review the terms to continue.',
        },
      },
      { status: SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS },
    );
  }

  const adultEligibility = await adultEligibilityForAcceptance(userId, parsed.data);
  if (adultEligibility !== 'confirmed') return ageRefusal(adultEligibility);

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
    if (parsed.data.surface === SIGN_UP_SURFACE) {
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
