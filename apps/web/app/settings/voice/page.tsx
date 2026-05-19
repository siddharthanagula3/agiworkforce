'use client';

import { useBillingStore } from '@/stores/unified/auth';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import Link from 'next/link';

const VOICE_CAPS: Record<string, string> = {
  free: 'BYOK only',
  hobby: '60 min/mo',
  pro: '300 min/mo',
  pro_plus: '1,500 min/mo',
  max: 'Unlimited',
  enterprise: 'Unlimited',
};

export default function VoiceSettingsPage() {
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';
  const voiceCap = VOICE_CAPS[tier] ?? 'BYOK only';
  const hasVoice = tier !== 'free';

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

      {/* Paywall banner for free tier */}
      {!hasVoice && (
        <div
          style={{
            border: '1px solid var(--border)',
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
              Voice transcription requires Hobby or higher
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Hobby includes {VOICE_CAPS['hobby']} of voice transcription. BYOK users can bring
              their own Whisper key.
            </div>
          </div>
          <Link
            href="/pricing"
            style={{
              padding: '8px 18px',
              background: 'var(--teal)',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            Upgrade to Hobby
          </Link>
        </div>
      )}

      {/* Voice settings */}
      <section
        style={{
          border: '1px solid var(--border)',
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
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Transcription
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Monthly allowance">
            <span
              style={{
                fontSize: 14,
                fontFamily: 'var(--mono)',
                color: hasVoice ? 'var(--teal)' : 'var(--text-3)',
                fontWeight: 600,
              }}
            >
              {voiceCap}
            </span>
          </Row>
          <Row label="Transcription model">
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Whisper (managed)</span>
          </Row>
          <Row label="AI cleanup">
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Enabled</span>
          </Row>
        </div>
      </section>

      {/* BYOK voice */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Bring Your Own Key (BYOK)
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>
            Plug in your own OpenAI API key to use Whisper transcription directly with no cap. Your
            requests go to OpenAI without any proxy.
          </p>
          <Link
            href="/byok"
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid var(--border)',
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
