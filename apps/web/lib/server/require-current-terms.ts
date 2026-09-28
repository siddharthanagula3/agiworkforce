import 'server-only';

import { redirect } from 'next/navigation';

import { hasAcceptedCurrentTerms } from '@/lib/server/terms';
import { requireAccountSecurityVerification } from '@/lib/server/account-security/page-gate';

export async function requireCurrentTermsAcceptance(
  userId: string,
  returnTo: string,
): Promise<void> {
  await requireAccountSecurityVerification(returnTo);
  if (await hasAcceptedCurrentTerms(userId)) return;

  redirect(`/login/complete?redirectTo=${encodeURIComponent(returnTo)}`);
}
