'use client';

import { useEffect } from 'react';

/**
 * GOV-25: the primary chat surface had no `error.tsx`, no `loading.tsx` and no
 * `not-found.tsx` while 24 marketing/auth segments had them, and no
 * `<ErrorBoundary>` wrapped it. One render exception therefore unwound past the
 * whole segment to the GLOBAL error page — losing the conversation the user was
 * in the middle of, and offering no way back into chat.
 *
 * This boundary keeps the failure inside /chat: `reset()` re-renders the
 * segment (the store still holds the conversation), and the fallback links
 * back into chat rather than to the marketing home page.
 */
export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next.js already reports this to the configured error sink; log locally so
    // the failure is visible in the browser console during development too.
    console.error('[chat] render error', error);
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        minHeight: '60vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: 'var(--text-1)' }}>
          Chat could not be displayed
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 20px' }}>
          Something went wrong while rendering this conversation. Your messages are saved — try
          again, or open a different conversation.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--settings-border)',
              background: 'var(--chat-accent-primary, #1a1a1a)',
              color: '#fff',
              padding: '8px 16px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <a
            href="/chat"
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--settings-border)',
              color: 'var(--text-2)',
              padding: '8px 16px',
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Back to chat
          </a>
        </div>
        {error.digest && (
          <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)' }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
