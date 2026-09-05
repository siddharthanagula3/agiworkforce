import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChatStreamRuntimeProvider } from '@/features/chat/components/ChatStreamRuntimeProvider';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get('x-agi-pathname');
  const redirectTo = requestedPath?.startsWith('/chat') ? requestedPath : '/chat';

  if (!userId) {
    return redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  await requireCurrentTermsAcceptance(userId, redirectTo);

  return <ChatStreamRuntimeProvider>{children}</ChatStreamRuntimeProvider>;
}
