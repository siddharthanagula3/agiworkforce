'use client';

import { useBillingStore } from '@shared/stores/web-auth-store';
import { BILLING_PLAN_PRICING, formatPrivacyModeLabel } from '@agiworkforce/types';
import Link from 'next/link';

const byokLabel = formatPrivacyModeLabel('byok');

export default function VoiceSettingsPage() {
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';
  void tier;
  // Voice transcription quotas and managed Whisper are not yet enforced or
  // billed, so we do not advertise tier minute caps or live capabilities.
  const hasVoice = false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
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
          Voice
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Push-to-talk transcription settings (Wispr Flow style).
        </p>
      </div>

      {/* Honest "coming soon" banner: voice transcription is not yet available */}
      {!hasVoice && (
        <div
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
              Voice transcription is coming soon
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Managed voice transcription is not available yet. When it ships you will be able to
              bring your own provider key on Desktop and CLI via {byokLabel}.
            </div>
          </div>
          <span
            style={{
              padding: '8px 18px',
              background: 'var(--bg-elev)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-3)',
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Coming soon
          </span>
        </div>
      )}

      {/* Voice settings */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
          opacity: hasVoice ? 1 : 0.5,
          pointerEvents: hasVoice ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Transcription
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Monthly allowance">
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Not available yet</span>
          </Row>
          <Row label="Transcription model">
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Not available yet</span>
          </Row>
          <Row label="AI cleanup">
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Not available yet</span>
          </Row>
        </div>
      </section>

      {/* BYOK voice */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Bring Your Own Key (BYOK)
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>
            When voice ships, you will be able to plug in your own OpenAI API key on Desktop and CLI
            to use Whisper transcription directly, with requests going to OpenAI without any proxy.
            BYOK lives on Desktop and CLI today.
          </p>
          <Link
            href="/byok"
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-2)',
              fontSize: 13,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Configure BYOK
          </Link>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 32,
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

// Suppress unused import warning - referenced at module level for type safety
void BILLING_PLAN_PRICING;
