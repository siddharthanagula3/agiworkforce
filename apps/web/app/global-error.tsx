'use client';

import { useEffect } from 'react';
import { Bot, RefreshCw, Home } from 'lucide-react';

// global-error.tsx replaces the root layout entirely, so it must render
// its own <html> and <body> tags. It cannot import from @shared/lib/logger
// because the logger may itself be broken when this boundary fires.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Use console directly — the shared logger may not be available at this level
    console.error('[GlobalError] Root layout error caught:', error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          backgroundColor: '#000',
          color: '#fff',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '28rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '5rem',
              height: '5rem',
              borderRadius: '9999px',
              backgroundColor: 'rgba(239,68,68,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}
          >
            <Bot style={{ width: '2.5rem', height: '2.5rem', color: '#ef4444' }} />
          </div>

          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.75rem',
            }}
          >
            Something Went Wrong
          </h1>

          <p style={{ color: '#a1a1aa', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            {error.message || 'A critical error occurred. Please reload the page.'}
          </p>

          {error.digest && (
            <p style={{ color: '#52525b', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
              Error ID: {error.digest}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              justifyContent: 'center',
              marginTop: '1.5rem',
            }}
          >
            <button
              onClick={reset}
              style={{
                display: 'inline-flex',
                height: '2.5rem',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '9999px',
                backgroundColor: '#2563eb',
                padding: '0 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <RefreshCw style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
              Try Again
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                height: '2.5rem',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '9999px',
                border: '1px solid #3f3f46',
                backgroundColor: '#18181b',
                padding: '0 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              <Home style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
              Go Home
            </a>
          </div>

          <div
            style={{
              marginTop: '3rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #27272a',
            }}
          >
            <p style={{ color: '#71717a', fontSize: '0.875rem' }}>
              If this problem persists,{' '}
              <a href="/contact" style={{ color: '#60a5fa' }}>
                contact our support team
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
