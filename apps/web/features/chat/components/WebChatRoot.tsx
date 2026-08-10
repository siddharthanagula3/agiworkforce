'use client';

import dynamic from 'next/dynamic';

/**
 * The signed-in chat surface, shared by `/` and `/chat`.
 *
 * GOV-25: the chat bundle is a `ssr: false` dynamic import, which previously had
 * NO `loading` option — a cold load painted a blank page until the client chunk
 * arrived. The inline skeleton below makes cold load and in-app navigation look
 * identical instead of showing nothing.
 *
 * This lives in the feature rather than in a route segment because two routes
 * mount it: `app/page.tsx` renders it for signed-in visitors on the root domain
 * (the chatgpt.com shape), and `app/chat/page.tsx` keeps the historical URL
 * working for existing links.
 */
const WebChatPage = dynamic(() => import('@features/chat/pages/WebChatPage'), {
  ssr: false,
  loading: () => <WebChatSkeleton />,
});

export function WebChatSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        display: 'flex',
        minHeight: '60vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        aria-label="Loading chat"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid var(--settings-border, rgba(255,255,255,0.15))',
          borderTopColor: 'var(--chat-accent-primary, #888)',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    </div>
  );
}

export function WebChatRoot() {
  return <WebChatPage />;
}
