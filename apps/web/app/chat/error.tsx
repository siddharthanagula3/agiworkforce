'use client';

import { useEffect, useState } from 'react';

import { networkErrorMessage } from '@/lib/user-error-message';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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

  useEffect(() => {
    console.error('[chat] render error', error);
  }, [error]);

  // The online check is not redundant with `networkErrorMessage`: in production
  // Next redacts this boundary's error to a digest, so nothing about the
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
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={reset}
            style={{
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
