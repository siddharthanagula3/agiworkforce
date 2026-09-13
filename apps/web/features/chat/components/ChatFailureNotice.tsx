'use client';

import { useEffect, useState } from 'react';

import { networkErrorMessage } from '@/lib/user-error-message';

export interface ChatFailureNoticeProps {
  error: Error & { digest?: string };
  onRetry: () => void;
}

/**
 * What the user sees when a conversation fails to render.
 *
 * Shared by two boundaries on purpose. `app/chat/error.tsx` is the route
 * boundary and replaces the whole page, so it is the last resort; the boundary
 * around the conversation column in `WebChatPage` catches the far more common
 * case and leaves the sidebar and the header standing. Both must say the same
 * thing and offer the same two ways out, or the same failure would read as two
 * different products depending on where it was thrown.
 */
export function ChatFailureNotice({ error, onRetry }: ChatFailureNoticeProps) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const read = () => setOffline(navigator.onLine === false);
    read();
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);

  // The online check is not redundant with `networkErrorMessage`: in production
  // Next redacts the route boundary's error to a digest, so nothing about the
  // original failure survives for the helper to read.
  const network = networkErrorMessage(error);
  const title = offline ? 'You are offline' : 'Chat could not be displayed';
  const description = offline
    ? 'This conversation cannot load while your connection is down. Your messages are saved, reconnect and try again.'
    : network
      ? `${network} Your messages are saved, try again, or open a different conversation.`
      : 'Something went wrong while rendering this conversation. Your messages are saved, try again, or open a different conversation.';

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        minHeight: '60vh',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: 'var(--text-1)' }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 20px' }}>{description}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              minHeight: 32,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--settings-border)',
              background: 'var(--chat-accent-primary, #1a1a1a)',
              color: 'var(--chat-accent-on-primary)',
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
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 32,
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
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
