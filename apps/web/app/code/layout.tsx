import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CODE_ROUTES } from '@/features/code/code-surface';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { getRequestIdentity } from '@/lib/server/identity';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';

export const dynamic = 'force-dynamic';

const PATHNAME_HEADER = 'x-agi-pathname';

export default async function CodeLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get(PATHNAME_HEADER);
  const redirectTo = requestedPath?.startsWith(CODE_ROUTES.root) ? requestedPath : CODE_ROUTES.root;

  if (!userId) {
    return redirect(sessionExpiredRedirect(redirectTo));
  }

  await requireCurrentTermsAcceptance(userId, redirectTo);

  return children;
}
