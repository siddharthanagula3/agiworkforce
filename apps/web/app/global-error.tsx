'use client';

import { type CSSProperties, useEffect } from 'react';
import { getFriendlyError } from '@agiworkforce/utils';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError] Root layout error caught:', error.digest ?? error.message);
  }, [error]);

  const friendly = getFriendlyError(error);

  const errorTheme = {
    '--global-error-bg': 'black',
    '--global-error-fg': 'white',
    '--global-error-muted': 'darkgray',
    '--global-error-quiet': 'gray',
    '--global-error-border': 'dimgray',
    '--global-error-panel': 'color-mix(in srgb, black 88%, white)',
    '--global-error-danger': 'crimson',
    '--global-error-danger-bg': 'color-mix(in srgb, crimson 12%, transparent)',
    '--global-error-primary': 'royalblue',
    '--global-error-link': 'lightskyblue',
  } as CSSProperties;

  return (
    <html lang="en">
      <body
        style={{
          ...errorTheme,
          margin: 0,
          backgroundColor: 'var(--global-error-bg)',
          color: 'var(--global-error-fg)',
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
              backgroundColor: 'var(--global-error-danger-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}
          >
            <svg
              width={40}
              height={40}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--global-error-danger)"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.75rem',
            }}
          >
            {friendly.title}
          </h1>

          <p
            style={{
              color: 'var(--global-error-muted)',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
            }}
          >
            {friendly.message}
          </p>

          {friendly.suggestion && (
            <p
              style={{
                color: 'var(--global-error-muted)',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {friendly.suggestion}
            </p>
          )}

          {error.digest && (
            <p
              style={{
                color: 'var(--global-error-quiet)',
                fontSize: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
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
                backgroundColor: 'var(--global-error-primary)',
                padding: '0 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--global-error-fg)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                height: '2.5rem',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '9999px',
                border: '1px solid var(--global-error-border)',
                backgroundColor: 'var(--global-error-panel)',
                padding: '0 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--global-error-fg)',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>

          <div
            style={{
              marginTop: '3rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--global-error-border)',
            }}
          >
            <p style={{ color: 'var(--global-error-quiet)', fontSize: '0.875rem' }}>
              If this keeps happening,{' '}
              <a href="/contact" style={{ color: 'var(--global-error-link)' }}>
                contact support
              </a>
              .
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
