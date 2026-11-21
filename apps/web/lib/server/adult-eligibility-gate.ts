import 'server-only';

import {
  ADULT_ELIGIBILITY_ERROR_CODES,
  ADULT_ELIGIBILITY_REVIEW_PATH,
} from '@agiworkforce/cloud-contracts';
import { ACCOUNT_AGE_INELIGIBLE_MESSAGE, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';
import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { recordFailure } from '@/lib/observability/metrics';
import type { AdultEligibilityState } from '@agiworkforce/cloud-contracts';
import { readAdultEligibilityState } from '@/lib/server/adult-eligibility';

export const ADULT_ELIGIBILITY_UNAVAILABLE_CODE = 'age_eligibility_unavailable';

const REFUSED_STATUS = 403;
const UNAVAILABLE_STATUS = 503;

export interface AdultEligibilityRefusal {
  status: typeof REFUSED_STATUS | typeof UNAVAILABLE_STATUS;
  code: string;
  message: string;
  reviewUrl: string | null;
}

export function adultEligibilityReviewUrl(origin: string, returnTo: string): string {
  const reviewUrl = new URL(ADULT_ELIGIBILITY_REVIEW_PATH, origin);
  reviewUrl.searchParams.set('redirectTo', returnTo);
  return reviewUrl.toString();
}

export const ADULT_ELIGIBILITY_UNAVAILABLE_MESSAGE =
  'Your account could not be checked just now. Try again in a moment.';

/**
 * The state a gate acts on. A decision that cannot be read is its own answer,
 * never `confirmed`, so an outage cannot admit an account nobody asked.
 */
export async function adultEligibilityForGate(
  userId: string,
  gate: string,
): Promise<AdultEligibilityState | 'unavailable'> {
  try {
    return await readAdultEligibilityState(userId);
  } catch (error) {
    logger.error({ error, userId, gate }, '[adult-eligibility] decision unreadable; refusing');
    recordFailure('database', 'adult_eligibility_unreadable');
    return 'unavailable';
  }
}

/**
 * The server's answer to "may this account use Cloud": null when a current
 * 18 and over decision is on record, a refusal otherwise. A signed-in session
 * is never that decision, and a decision that cannot be read is refused, not
 * assumed, so an outage cannot admit an account nobody asked.
 */
export async function refuseWithoutAdultEligibility(input: {
  userId: string;
  origin: string;
  returnTo: string;
  gate: string;
}): Promise<AdultEligibilityRefusal | null> {
  const { userId, origin, returnTo, gate } = input;
  const state = await adultEligibilityForGate(userId, gate);
  if (state === 'confirmed') return null;
  if (state === 'unavailable') {
    return {
      status: UNAVAILABLE_STATUS,
      code: ADULT_ELIGIBILITY_UNAVAILABLE_CODE,
      message: ADULT_ELIGIBILITY_UNAVAILABLE_MESSAGE,
      reviewUrl: null,
    };
  }

  const reviewUrl = adultEligibilityReviewUrl(origin, returnTo);
  if (state === 'ineligible') {
    return {
      status: REFUSED_STATUS,
      code: ADULT_ELIGIBILITY_ERROR_CODES.ineligible,
      message: ACCOUNT_AGE_INELIGIBLE_MESSAGE,
      reviewUrl,
    };
  }
  return {
    status: REFUSED_STATUS,
    code: ADULT_ELIGIBILITY_ERROR_CODES.confirmationRequired,
    message: `Confirm your age at ${reviewUrl} to continue, then try again.`,
    reviewUrl,
  };
}

export function adultEligibilityRefusalResponse(
  refusal: AdultEligibilityRefusal,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message: refusal.message,
        type: refusal.reviewUrl ? 'invalid_request_error' : 'server_error',
        code: refusal.code,
        ...(refusal.reviewUrl ? { review_url: refusal.reviewUrl } : {}),
      },
      minimum_age: ACCOUNT_MINIMUM_AGE,
      ...(refusal.reviewUrl ? { review_url: refusal.reviewUrl } : {}),
    },
    { status: refusal.status, headers },
  );
}

/**
 * The gate every route that starts Cloud compute for a signed-in account puts
 * in front of the work: chat, images, video, speech, live voice, transcription
 * and embeddings. It is its own gate, beside the kill switch and the workspace
 * policy, because it answers a different question: whether this person may use
 * Cloud at all. Returns null when a current 18 and over decision is on record.
 */
export async function buildAdultEligibilityGateResponse(input: {
  userId: string;
  request: Request;
  gate: string;
  headers?: HeadersInit;
}): Promise<NextResponse | null> {
  const refusal = await refuseWithoutAdultEligibility({
    userId: input.userId,
    origin: new URL(input.request.url).origin,
    returnTo: '/chat',
    gate: input.gate,
  });
  return refusal ? adultEligibilityRefusalResponse(refusal, input.headers) : null;
}
