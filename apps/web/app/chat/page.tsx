'use client';

import dynamic from 'next/dynamic';

const ChatPage = dynamic(() => import('@features/chat/pages/ChatInterface'), {
  ssr: false,
});

export default function Page() {
  return <ChatPage />;
}
