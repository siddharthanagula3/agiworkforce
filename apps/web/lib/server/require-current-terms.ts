import 'server-only';

import { redirect } from 'next/navigation';

import { hasAcceptedCurrentTerms } from '@/lib/server/terms';

export async function requireCurrentTermsAcceptance(
  userId: string,
  returnTo: string,
): Promise<void> {
  if (await hasAcceptedCurrentTerms(userId)) return;

  redirect(`/login/complete?redirectTo=${encodeURIComponent(returnTo)}`);
}
