'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useChatStream, type UseChatStreamReturn } from '@/lib/hooks/useChatStream';

const ChatStreamRuntimeContext = createContext<UseChatStreamReturn | null>(null);

/**
 * Owns managed chat requests above the individual `/chat/[sessionId]` page.
 *
 * The chat layout remains mounted while the user switches conversations. Keeping
 * the stream controller here therefore lets an in-flight response continue into
 * its conversation-scoped store bucket while a different chat is on screen.
 */
export function ChatStreamRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useChatStream();

  return (
    <ChatStreamRuntimeContext.Provider value={runtime}>
      {children}
    </ChatStreamRuntimeContext.Provider>
  );
}

export function useChatStreamRuntime(): UseChatStreamReturn {
  const runtime = useContext(ChatStreamRuntimeContext);
  if (!runtime) {
    throw new Error('useChatStreamRuntime must be used within ChatStreamRuntimeProvider');
  }
  return runtime;
}
