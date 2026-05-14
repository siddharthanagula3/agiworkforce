'use client';

import dynamic from 'next/dynamic';

const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
});

export default function Page() {
  return <WebChatPage />;
}
