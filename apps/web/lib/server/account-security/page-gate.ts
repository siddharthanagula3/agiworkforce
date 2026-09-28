import 'server-only';

import { redirect } from 'next/navigation';
import { accountSecurityVerifyPageHref } from '@agiworkforce/cloud-contracts/account-security';

import { getRequestIdentity } from '@/lib/server/identity';
import { subjectSessionPassesAccountSecurity } from './gate';

export async function requireAccountSecurityVerification(returnTo: string): Promise<void> {
  const { subject, sessionId } = await getRequestIdentity();
  if (!subject) return;
  if (await subjectSessionPassesAccountSecurity(subject, sessionId)) return;
  redirect(accountSecurityVerifyPageHref(returnTo));
}
