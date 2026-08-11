import 'server-only';

import { redirect } from 'next/navigation';

import { hasAcceptedCurrentTerms } from '@/lib/server/terms';

/**
 * Keep authenticated Web surfaces on the exact policy revision currently live.
 * The completion route is deliberately outside protected layouts, so this
 * redirect cannot loop while the user reviews and records the new revision.
 */
export async function requireCurrentTermsAcceptance(
  userId: string,
  returnTo: string,
): Promise<void> {
  if (await hasAcceptedCurrentTerms(userId)) return;

  redirect(`/login/complete?redirectTo=${encodeURIComponent(returnTo)}`);
}
