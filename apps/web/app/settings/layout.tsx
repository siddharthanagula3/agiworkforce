import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get('x-agi-pathname') ?? '/settings/general';

  if (!userId) {
    return redirect(`/login?redirectTo=${encodeURIComponent(requestedPath)}`);
  }

  await requireCurrentTermsAcceptance(userId, requestedPath);

  return <>{children}</>;
}
