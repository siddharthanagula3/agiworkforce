'use client';

import dynamic from 'next/dynamic';
import ChatLoading from '../loading';

const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
  loading: () => <ChatLoading />,
});

export default function Page() {
  return <WebChatPage />;
}
