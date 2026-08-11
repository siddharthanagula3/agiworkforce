import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';

export const dynamic = 'force-dynamic';

export default async function BillingLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    return redirect('/login?redirectTo=/billing');
  }

  await requireCurrentTermsAcceptance(userId, '/billing');

  return <>{children}</>;
}
