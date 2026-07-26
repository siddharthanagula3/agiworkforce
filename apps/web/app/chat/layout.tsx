import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChatStreamRuntimeProvider } from '@/features/chat/components/ChatStreamRuntimeProvider';

export const dynamic = 'force-dynamic';

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    const requestHeaders = await headers();
    const requestedPath = requestHeaders.get('x-agi-pathname');
    const redirectTo = requestedPath?.startsWith('/chat') ? requestedPath : '/chat';
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return <ChatStreamRuntimeProvider>{children}</ChatStreamRuntimeProvider>;
}
