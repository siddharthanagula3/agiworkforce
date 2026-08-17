'use client';

import dynamic from 'next/dynamic';

import { ChatLoadingSkeleton } from './ChatLoadingSkeleton';

const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
  loading: () => <ChatLoadingSkeleton />,
});

export function WebChatRoot() {
  return <WebChatPage />;
}
