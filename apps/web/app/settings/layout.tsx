import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get('x-agi-pathname') ?? '/settings/general';

  if (!userId) {
    return redirect(`/login?redirectTo=${encodeURIComponent(requestedPath)}`);
  }

  await requireCurrentTermsAcceptance(userId, requestedPath);

  return <>{children}</>;
}
