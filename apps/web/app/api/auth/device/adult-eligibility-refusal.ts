import 'server-only';

import { NextResponse } from 'next/server';
import type { AdultEligibilityState, DeviceTokenError } from '@agiworkforce/cloud-contracts';
import { ACCOUNT_AGE_INELIGIBLE_MESSAGE } from '@agiworkforce/types';

import {
  ADULT_ELIGIBILITY_UNAVAILABLE_MESSAGE,
  adultEligibilityForGate,
} from '@/lib/server/adult-eligibility-gate';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * A device is refused in the two shapes every released client already follows:
 * an account still to be asked is sent to the review screen the way a terms
 * revision sends it, and a refused account is told it is unavailable. Neither
 * consumes the code or the refresh token, so the same device resumes once the
 * account has answered on the web.
 */
export function deviceAdultEligibilityResponse(
  state: Exclude<AdultEligibilityState, 'confirmed'>,
  acceptanceUrl: string,
): NextResponse {
  if (state === 'ineligible') {
    return NextResponse.json(
      {
        error: 'account_unavailable',
        error_description: ACCOUNT_AGE_INELIGIBLE_MESSAGE,
        recovery_url: acceptanceUrl,
      } satisfies DeviceTokenError,
      { status: 403, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    {
      error: 'terms_acceptance_required',
      review: 'age',
      error_description: `Confirm your age at ${acceptanceUrl} to keep using this device.`,
      acceptance_url: acceptanceUrl,
    } satisfies DeviceTokenError,
    { status: 403, headers: NO_STORE },
  );
}

export async function deviceAdultEligibilityRefusal(input: {
  userId: string;
  acceptanceUrl: string;
  gate: string;
}): Promise<NextResponse | null> {
  const state = await adultEligibilityForGate(input.userId, input.gate);
  if (state === 'confirmed') return null;
  if (state === 'unavailable') {
    return NextResponse.json(
      {
        error: 'temporarily_unavailable',
        error_description: ADULT_ELIGIBILITY_UNAVAILABLE_MESSAGE,
      },
      { status: 503, headers: NO_STORE },
    );
  }
  return deviceAdultEligibilityResponse(state, input.acceptanceUrl);
}
