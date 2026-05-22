/**
 * /settings/byok — API keys (BYOK) settings section.
 *
 * Shows which env-based provider keys are configured (presence only, never value).
 * UI key entry is Cloud Managed waitlist-gated in v1.
 *
 * Server component: passes static provider list to client EnvKeyStatusList
 * which fetches /api/byok/env-key-status at render time.
 */

import Link from 'next/link';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { EnvKeyStatusList } from './EnvKeyStatusList';
import { WaitlistForm } from '../../byok/WaitlistForm';

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
          Env-based keys are active in v1. UI key entry is coming in Cloud Managed private beta.{' '}
          <Link href="/docs/byok-env" style={{ color: 'var(--amber, #c8892a)' }}>
            How to set env keys &rarr;
          </Link>
        </p>
      </div>

      {/* Status notice */}
      <div
        role="status"
        style={{
          border: '1px dashed var(--border)',
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
            background: 'var(--border)',
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
        {/* EnvKeyStatusList is a client component — receives static provider metadata,
            fetches isSet status from /api/byok/env-key-status at mount */}
        <EnvKeyStatusList providers={BYOK_PROVIDERS} />
      </section>

      {/* Waitlist CTA card */}
      <section
        style={{
          border: '1px solid color-mix(in srgb, var(--amber, #c8892a) 35%, transparent)',
          borderRadius: 'var(--radius-lg)',
          background: 'color-mix(in srgb, var(--amber, #c8892a) 6%, var(--bg-elev))',
          overflow: 'hidden',
        }}
      >
        {/* Card header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid color-mix(in srgb, var(--amber, #c8892a) 20%, transparent)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 100,
              background: 'color-mix(in srgb, var(--amber, #c8892a) 20%, transparent)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--amber, #c8892a)',
            }}
          >
            Coming soon
          </span>
          Save your keys via UI
        </div>

        {/* Card body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>
            Currently only env-based keys are supported in v1. UI key entry, OS-keychain storage,
            and revoke-all are launching in Cloud Managed private beta.
          </p>
          <WaitlistForm source="byok" ctaLabel="Join Cloud Managed waitlist →" />
        </div>
      </section>
    </div>
  );
}
