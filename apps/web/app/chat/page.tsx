'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
});

const UnifiedChatPage = dynamic(() => import('@features/chat/pages/UnifiedChatPage'), {
  ssr: false,
});

function ChatPageInner() {
  const searchParams = useSearchParams();
  const useUnified = searchParams.get('unified') === '1';
  return useUnified ? <UnifiedChatPage /> : <WebChatPage />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
