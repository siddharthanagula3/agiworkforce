import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    return redirect('/login?redirectTo=/billing');
  }

  await requireCurrentTermsAcceptance(userId, '/billing');

  return <>{children}</>;
}
