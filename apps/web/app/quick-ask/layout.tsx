import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChatStreamRuntimeProvider } from '@/features/chat/components/ChatStreamRuntimeProvider';
import { getRequestIdentity } from '@/lib/server/identity';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export const dynamic = 'force-dynamic';

export default async function QuickAskLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get('x-agi-pathname');
  const redirectTo = requestedPath?.startsWith('/quick-ask') ? requestedPath : '/quick-ask';

  if (!userId) {
    return redirect(sessionExpiredRedirect(redirectTo));
  }

  await requireCurrentTermsAcceptance(userId, redirectTo);

  return (
    <ProductRuntimeProviders>
      <ChatStreamRuntimeProvider>{children}</ChatStreamRuntimeProvider>
    </ProductRuntimeProviders>
  );
}
