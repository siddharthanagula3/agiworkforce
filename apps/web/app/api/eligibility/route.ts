import { NextRequest, NextResponse } from 'next/server';
import {
  ADULT_ELIGIBILITY_ERROR_CODES,
  AdultEligibilityRequestSchema,
  type AdultEligibilityState,
  type AdultEligibilityStatus,
} from '@agiworkforce/cloud-contracts';
import { ACCOUNT_AGE_INELIGIBLE_MESSAGE, ACCOUNT_MINIMUM_AGE } from '@agiworkforce/types';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import {
  readAdultEligibilityState,
  submitAdultEligibilityEvidence,
} from '@/lib/server/adult-eligibility';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;
const INELIGIBLE_STATUS = 403;
const INCONCLUSIVE_STATUS = 422;

function status(state: AdultEligibilityState): AdultEligibilityStatus {
  return { minimumAge: ACCOUNT_MINIMUM_AGE, state };
}

async function handleReadEligibility(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);
  return NextResponse.json(status(await readAdultEligibilityState(userId)), { headers: NO_STORE });
}

async function handleSubmitEvidence(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const { userId } = await getClerkAuthUser(request);

  const parsed = AdultEligibilityRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid eligibility payload', parsed.error.flatten());
  }

  const state = await submitAdultEligibilityEvidence(
    userId,
    parsed.data.surface,
    parsed.data.evidence,
  );

  if (state === 'ineligible') {
    return NextResponse.json(
      {
        error: {
          code: ADULT_ELIGIBILITY_ERROR_CODES.ineligible,
          message: ACCOUNT_AGE_INELIGIBLE_MESSAGE,
        },
        ...status(state),
      },
      { status: INELIGIBLE_STATUS, headers: NO_STORE },
    );
  }
  if (state === 'unconfirmed') {
    return NextResponse.json(
      {
        error: {
          code: ADULT_ELIGIBILITY_ERROR_CODES.inconclusive,
          message: 'That did not settle your age. Enter your age in years to continue.',
        },
        ...status(state),
      },
      { status: INCONCLUSIVE_STATUS, headers: NO_STORE },
    );
  }
  return NextResponse.json(status(state), { headers: NO_STORE });
}

export const GET = withErrorHandler(handleReadEligibility);
export const POST = withErrorHandler(handleSubmitEvidence);
