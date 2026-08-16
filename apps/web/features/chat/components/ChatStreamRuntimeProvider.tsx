'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useChatStream, type UseChatStreamReturn } from '@/lib/hooks/useChatStream';

const ChatStreamRuntimeContext = createContext<UseChatStreamReturn | null>(null);

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
