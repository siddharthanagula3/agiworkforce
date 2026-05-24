'use client';

import { useBillingStore } from '@/stores/unified/auth';
import Link from 'next/link';

interface CapRow {
  label: string;
  description: string;
  tiers: string[];
  /** Tiers where access is granted but at a lower token cap than Pro/Max */
  lowerCapTiers?: string[];
  link?: string;
}

const CAPABILITIES: CapRow[] = [
  {
    label: 'Voice transcription',
    description: 'Push-to-talk Whisper transcription with AI cleanup.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
    link: '/settings/voice',
  },
  {
    label: 'Image generation',
    description: 'Generate images via managed cloud or BYOK.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Video generation',
    description: 'Runway Gen-4, Veo-3, and Sora 2 routing.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Computer use',
    description: 'Automated browser and desktop actions.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Extended thinking',
    description: 'Adaptive reasoning for complex tasks.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Web search',
    description: 'Real-time search across 10+ providers.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'MCP connectors',
    description: 'Connect external tools via Model Context Protocol.',
    tiers: ['hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'BYOK (any tier)',
    description: 'Bring your own API keys to bypass all managed caps.',
    tiers: ['free', 'hobby', 'pro', 'max'],
  },
];

const TIER_ORDER = ['free', 'hobby', 'pro', 'max'];
const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
};

export default function CapabilitiesSettingsPage() {
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';

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
          Capabilities
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Features available on your current{' '}
          <strong style={{ color: 'var(--teal)' }}>{TIER_LABEL[tier] ?? 'Free'}</strong> plan.
        </p>
      </div>

      {/* Capability table */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr repeat(4, 60px)',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Feature</span>
          {TIER_ORDER.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11,
                fontWeight: t === tier ? 700 : 500,
                color: t === tier ? 'var(--teal)' : 'var(--text-3)',
                textAlign: 'center',
              }}
            >
              {TIER_LABEL[t]}
            </span>
          ))}
        </div>

        {/* Rows */}
        {CAPABILITIES.map((cap, i) => {
          const hasFeature = cap.tiers.includes(tier);
          return (
            <div
              key={cap.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr repeat(4, 60px)',
                padding: '12px 20px',
                borderBottom: i < CAPABILITIES.length - 1 ? '1px solid var(--border)' : undefined,
                gap: 4,
                alignItems: 'center',
                background: hasFeature ? undefined : 'rgba(255,255,255,0.01)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: hasFeature ? 'var(--text-1)' : 'var(--text-3)',
                    marginBottom: 2,
                  }}
                >
                  {cap.label}
                  {cap.link && hasFeature && (
                    <Link
                      href={cap.link}
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: 'var(--teal)',
                        textDecoration: 'none',
                      }}
                    >
                      Configure
                    </Link>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{cap.description}</div>
              </div>
              {TIER_ORDER.map((t) => {
                const included = cap.tiers.includes(t);
                const isLowerCap = included && (cap.lowerCapTiers ?? []).includes(t);
                const isCurrent = t === tier;
                return (
                  <div
                    key={t}
                    style={{
                      textAlign: 'center',
                      fontSize: 16,
                      color: included ? 'var(--teal)' : 'var(--text-3)',
                      fontWeight: isCurrent && included ? 700 : 400,
                    }}
                    title={isLowerCap ? 'Available at a lower token cap than Pro/Max' : undefined}
                  >
                    {included ? (isLowerCap ? '✓*' : '✓') : '·'}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      {/* Lower cap footnote */}
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
        * Available on Hobby at a lower token cap than Pro/Max.
      </p>

      {/* Upgrade CTA */}
      {(tier === 'free' || tier === 'hobby') && (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Link
            href="/pricing"
            style={{
              padding: '9px 20px',
              background: 'var(--teal)',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {tier === 'free' ? 'Upgrade to Hobby' : 'Upgrade to Pro'}
          </Link>
        </div>
      )}
    </div>
  );
}
