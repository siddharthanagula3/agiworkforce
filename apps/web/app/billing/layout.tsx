import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { getRequestIdentity } from '@/lib/server/identity';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';

export const dynamic = 'force-dynamic';

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    return redirect(sessionExpiredRedirect('/billing'));
  }

  await requireCurrentTermsAcceptance(userId, '/billing');

  return <>{children}</>;
}
