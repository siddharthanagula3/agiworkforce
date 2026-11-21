import 'server-only';

import { redirect } from 'next/navigation';
import { ADULT_ELIGIBILITY_REVIEW_PATH } from '@agiworkforce/cloud-contracts';

import { readAdultEligibilityState } from '@/lib/server/adult-eligibility';

/**
 * Product pages open only to an account the server holds a current 18 and over
 * decision for. A signed-in session is not that decision. Settings and billing
 * do not call this: an account that is asked, or refused, still has to reach
 * its data export, its deletion and its subscription.
 */
export async function requireAdultEligibility(userId: string, returnTo: string): Promise<void> {
  if ((await readAdultEligibilityState(userId)) === 'confirmed') return;

  redirect(`${ADULT_ELIGIBILITY_REVIEW_PATH}?redirectTo=${encodeURIComponent(returnTo)}`);
}
