'use client';

import dynamic from 'next/dynamic';
import ChatLoading from '../loading';

/**
 * GOV-25: the chat bundle is a `ssr: false` dynamic import, which previously
 * had NO `loading` option — a cold load painted a blank page until the client
 * chunk arrived. Reusing the segment's `loading.tsx` skeleton makes cold load
 * and in-app navigation look identical instead of showing nothing.
 */
const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
  loading: () => <ChatLoading />,
});

export default function Page() {
  return <WebChatPage />;
}
