'use client';

import { useEffect } from 'react';

import { ChatFailureNotice } from '@/features/chat/components/ChatFailureNotice';

/**
 * The route boundary, and the last resort. A failure thrown while the page's
 * own hooks run reaches here and replaces everything, sidebar and header
 * included; a failure while the transcript renders is caught one level down, by
 * the boundary around the conversation column in `WebChatPage`, which keeps the
 * shell on screen. Both render {@link ChatFailureNotice}.
 */
export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[chat] render error', error);
  }, [error]);

  return <ChatFailureNotice error={error} onRetry={reset} />;
}
