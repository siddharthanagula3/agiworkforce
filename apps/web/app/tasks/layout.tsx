import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getRequestIdentity } from '@/lib/server/identity';
import { requireAdultEligibility } from '@/lib/server/require-adult-eligibility';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export const dynamic = 'force-dynamic';

// The proxy gate for /tasks only checks that a session cookie NAME is present,
// so this is the first place the session is actually verified.
export default async function TasksLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    return redirect(sessionExpiredRedirect('/tasks'));
  }

  await requireAdultEligibility(userId, '/tasks');

  return <ProductRuntimeProviders>{children}</ProductRuntimeProviders>;
}
