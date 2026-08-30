import Link from 'next/link';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { EnvKeyStatusList } from './EnvKeyStatusList';

export default function ByokSettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Page header */}
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          API keys (BYOK)
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          These are deployment-managed environment keys, not per-account Web BYOK. Hosted AGI Web
          does not store user provider keys; use Desktop, CLI, or VS Code for user-managed BYOK.{' '}
          {/* Colour alone does not distinguish a link inside a paragraph
              (WCAG 1.4.1); the underline is what makes it findable. */}
          <Link
            href="/docs/byok-env"
            style={{ color: 'var(--amber)', textDecoration: 'underline' }}
          >
            How to set env keys &rarr;
          </Link>
        </p>
      </div>

      {/* Status notice */}
      <div
        role="status"
        style={{
          border: '1px dashed var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '14px 18px',
          fontSize: 13,
          color: 'var(--text-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--settings-border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          i
        </span>
        Key presence is checked server-side. Values are never sent to the browser.
      </div>

      {/* Provider key status list */}
      <section>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Providers
        </div>
        {/* EnvKeyStatusList is a client component · receives static provider metadata,
            fetches isSet status from /api/byok/env-key-status at mount */}
        <EnvKeyStatusList providers={BYOK_PROVIDERS} />
      </section>
    </div>
  );
}
