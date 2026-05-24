'use client';

import { useBillingStore } from '@/stores/unified/auth';
import Link from 'next/link';

interface CapRow {
  label: string;
  /** Tooltip shown on hover; explains what the feature does. */
  tooltip: string;
  description: string;
  tiers: string[];
  /** Tiers where access is granted but at a lower token cap than Pro/Max */
  lowerCapTiers?: string[];
  link?: string;
}

const CAPABILITIES: CapRow[] = [
  {
    label: 'Voice transcription',
    tooltip: 'Push-to-talk audio input transcribed via Whisper, with AI cleanup of filler words.',
    description: 'Push-to-talk Whisper transcription with AI cleanup.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
    link: '/settings/voice',
  },
  {
    label: 'Image generation',
    tooltip: 'Generate images from text prompts via managed cloud providers or your own API keys.',
    description: 'Generate images via managed cloud or BYOK.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Video generation',
    tooltip:
      'Generate short video clips from text or image prompts using multiple model providers.',
    description: 'Runway Gen-4, Veo-3, and Sora 2 routing.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Computer use',
    tooltip: 'AI-driven browser and desktop automation. The model can click, scroll, and type.',
    description: 'Automated browser and desktop actions.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Extended thinking',
    tooltip: 'Lets the model spend extra compute on step-by-step reasoning before answering.',
    description: 'Adaptive reasoning for complex tasks.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'Web search',
    tooltip: 'Routes queries to live search results from 10+ providers for up-to-date answers.',
    description: 'Real-time search across 10+ providers.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'MCP connectors',
    tooltip: 'Connect external tools and data sources using the Model Context Protocol standard.',
    description: 'Connect external tools via Model Context Protocol.',
    tiers: ['byok', 'hobby', 'pro', 'max'],
    lowerCapTiers: ['hobby'],
  },
  {
    label: 'BYOK (any tier)',
    tooltip: 'Bring your own provider API keys. Bypasses all managed token caps on any plan.',
    description: 'Bring your own API keys to bypass all managed caps.',
    tiers: ['free', 'local', 'byok', 'hobby', 'pro', 'max'],
  },
  {
    label: 'Local models',
    tooltip:
      'Run models entirely on your own hardware via Ollama or LM Studio. No data leaves your device.',
    description: 'Ollama and LM Studio local inference. No data leaves your device.',
    tiers: ['free', 'local', 'byok', 'hobby', 'pro', 'max'],
  },
];

const TIER_ORDER = ['local', 'free', 'byok', 'hobby', 'pro', 'max'];
const TIER_LABEL: Record<string, string> = {
  local: 'Local',
  free: 'Free',
  byok: 'BYOK',
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
            gridTemplateColumns: '1fr repeat(6, 56px)',
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
                gridTemplateColumns: '1fr repeat(6, 56px)',
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
                  <span
                    title={cap.tooltip}
                    style={{ cursor: 'help', borderBottom: '1px dotted var(--text-3)' }}
                  >
                    {cap.label}
                  </span>
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
                      fontSize: isLowerCap ? 10 : 16,
                      color: included ? 'var(--teal)' : 'var(--text-3)',
                      fontWeight: isCurrent && included ? 700 : 400,
                      lineHeight: 1.2,
                    }}
                    title={isLowerCap ? 'Available at a lower token cap than Pro/Max' : undefined}
                  >
                    {included ? (
                      isLowerCap ? (
                        <span style={{ fontSize: 11 }}>✓ (lower cap)</span>
                      ) : (
                        '✓'
                      )
                    ) : (
                      '·'
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      {/* Lower cap footnote */}
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
        Lower cap: available on Hobby with a smaller token quota than Pro/Max.
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
            {tier === 'hobby' ? 'Upgrade to Pro' : 'Upgrade to Hobby'}
          </Link>
        </div>
      )}
    </div>
  );
}
