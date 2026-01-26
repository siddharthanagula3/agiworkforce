'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ChatContainer to avoid SSR issues with Zustand
const ChatContainer = dynamic(
  () => import('@/components/chat/ChatContainer').then((mod) => mod.ChatContainer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading chat...</p>
        </div>
      </div>
    ),
  },
);

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500" />
        </div>
      }
    >
      <ChatContainer className="h-screen" />
    </Suspense>
  );
}
