import { useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  Mic,
  Image,
  Film,
  Monitor,
  Cpu,
  Shield,
  X,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import { BILLING_PLAN_PRICING, type BillingPlanTier } from '@agiworkforce/types';

interface TierDef {
  id: BillingPlanTier;
  tagline: string;
  cta: string;
  ctaVariant: 'primary' | 'ghost' | 'teal';
  popular?: boolean;
  caps: {
    opus: number;
    sonnet: number;
    voice: number;
    image: number;
    video: number;
    computer: number;
  };
}

// -1 = unlimited, 0 = unavailable/BYOK-only
const TIER_DEFS: TierDef[] = [
  {
    id: 'free',
    tagline: '$0 Local & BYOK — your keys, no caps.',
    cta: 'Get started',
    ctaVariant: 'ghost',
    caps: { opus: 0, sonnet: 0, voice: 0, image: 0, video: 0, computer: 0 },
  },
  {
    id: 'hobby',
    tagline: 'Managed cloud for everyday AI workflows.',
    cta: 'Start 14-day trial',
    ctaVariant: 'teal',
    caps: { opus: 5, sonnet: 100, voice: 60, image: 10, video: 0, computer: 0 },
  },
  {
    id: 'pro',
    tagline: 'Serious work across every modality.',
    cta: 'Upgrade to Pro',
    ctaVariant: 'teal',
    caps: { opus: 45, sonnet: -1, voice: 300, image: 50, video: 30, computer: 200 },
  },
  {
    id: 'pro_plus',
    tagline: 'Power users who push every surface.',
    cta: 'Upgrade to Pro+',
    ctaVariant: 'primary',
    popular: true,
    caps: { opus: 145, sonnet: -1, voice: 1500, image: -1, video: 60, computer: 1000 },
  },
  {
    id: 'max',
    tagline: 'No ceilings. Maximum everything.',
    cta: 'Upgrade to Max',
    ctaVariant: 'ghost',
    caps: { opus: -1, sonnet: -1, voice: -1, image: -1, video: 300, computer: 2500 },
  },
];

const CAP_ROWS = [
  { key: 'opus' as const, label: 'Opus prompts', Icon: Sparkles, unit: 'prompts/day' },
  { key: 'sonnet' as const, label: 'Sonnet prompts', Icon: MessageSquare, unit: 'prompts/day' },
  { key: 'voice' as const, label: 'Voice', Icon: Mic, unit: 'min/mo' },
  { key: 'image' as const, label: 'Image gen', Icon: Image, unit: 'gens/mo' },
  { key: 'video' as const, label: 'Video gen', Icon: Film, unit: 'sec/mo' },
  { key: 'computer' as const, label: 'Computer use', Icon: Monitor, unit: 'actions/mo' },
];

const FAQ_ITEMS = [
  {
    q: 'What is BYOK and can I always use it?',
    a: 'Bring Your Own Keys (BYOK) means you plug in your own API keys from Anthropic, OpenAI, Google, or any of our 10+ supported providers. It is free forever on any tier — your requests go direct to the provider, zero proxy.',
  },
  {
    q: 'What happens when I hit a cap?',
    a: 'We show an in-app banner at 80% and a hard-stop modal at 100%. No silent downgrade, no auto-charge. You choose: switch to a lighter model, buy a top-up pack, or wait for the next reset window.',
  },
  {
    q: 'Can I pause instead of cancel?',
    a: 'Yes. Pause for 1, 3, or 6 months from the billing settings page. Your memory, projects, and history are preserved throughout. No data deleted.',
  },
  {
    q: 'What is the annual price-lock refund guarantee?',
    a: "If we raise prices during your annual term, we'll refund the unused portion in full — prorated to the day. Refunds land within 7 business days.",
  },
  {
    q: 'Is there an education discount?',
    a: 'Yes. Verify your .edu email and get 50% off any paid tier. Applied immediately on verification.',
  },
  {
    q: 'Do you train on my conversations?',
    a: 'Never. We do not use your chats to train any model. Your data stays yours.',
  },
  {
    q: 'What are top-up packs?',
    a: '$5–10 each for 100 Opus prompts, 60 voice minutes, 10 image generations, 30 video seconds, or 200 computer-use actions. Purchased à la carte, never auto-renewed.',
  },
  {
    q: 'How does the 14-day Hobby trial work?',
    a: 'No card required. You get full Hobby access for 14 days. After that you can subscribe, downgrade to the free BYOK tier, or do nothing — we never charge without consent.',
  },
];

function fmtCap(
  key: TierDef['caps'] extends Record<infer K, number> ? K : never,
  n: number,
  unit: string,
): string {
  if (n === -1) return 'Unlimited';
  if (n === 0) {
    if (key === 'voice') return 'BYOK only';
    return '—';
  }
  return `${n.toLocaleString()} ${unit}`;
}

export interface PricingProps {
  currentTier?: BillingPlanTier;
  onUpgrade?: (tier: BillingPlanTier) => void;
  onBYOK?: () => void;
}

export function Pricing({ currentTier = 'free', onUpgrade, onBYOK }: PricingProps) {
  const [yearly, setYearly] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [spendStack, setSpendStack] = useState<Record<string, boolean>>({});

  const SPEND_OPTIONS = [
    { id: 'chatgpt', label: 'ChatGPT Plus', price: 20 },
    { id: 'claude', label: 'Claude Pro', price: 20 },
    { id: 'perplexity', label: 'Perplexity Pro', price: 20 },
    { id: 'cursor', label: 'Cursor Pro', price: 20 },
    { id: 'gemini', label: 'Gemini Advanced', price: 20 },
    { id: 'copilot', label: 'GitHub Copilot', price: 10 },
    { id: 'wispr', label: 'Wispr Flow', price: 15 },
    { id: 'midjourney', label: 'Midjourney', price: 30 },
  ];

  const spendTotal = SPEND_OPTIONS.filter((o) => spendStack[o.id]).reduce(
    (sum, o) => sum + o.price,
    0,
  );
  const proYearly = BILLING_PLAN_PRICING.pro.yearlyPriceUsd;
  const savings = Math.max(0, spendTotal * 12 - proYearly);

  return (
    <div className="scrollarea scrollbar-fancy" style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1020, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 34,
              fontWeight: 500,
              margin: '0 0 10px',
              color: 'var(--text-1)',
            }}
          >
            One subscription. Six surfaces. Every major AI provider.
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 15, margin: '0 0 24px' }}>
            Pay for capability, not credits. Cancel or downgrade in two clicks.
          </p>

          {/* Toggle */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--bg-soft)',
              borderRadius: 'var(--radius)',
              padding: 3,
              gap: 2,
              border: '1px solid var(--border)',
            }}
          >
            <button
              onClick={() => setYearly(false)}
              style={{
                padding: '6px 18px',
                borderRadius: 'calc(var(--radius) - 2px)',
                border: 'none',
                background: !yearly ? 'var(--bg-elev)' : 'transparent',
                color: !yearly ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: !yearly ? 600 : 400,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              style={{
                padding: '6px 18px',
                borderRadius: 'calc(var(--radius) - 2px)',
                border: 'none',
                background: yearly ? 'var(--bg-elev)' : 'transparent',
                color: yearly ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: yearly ? 600 : 400,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Yearly
              {yearly && (
                <span
                  style={{
                    background: 'var(--terracotta)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 10,
                    letterSpacing: 0.3,
                  }}
                >
                  2 months free
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 40,
          }}
        >
          {TIER_DEFS.map((tier) => {
            const plan = BILLING_PLAN_PRICING[tier.id];
            const price = yearly ? plan.yearlyPriceUsd : plan.monthlyPriceUsd;
            const isCurrent = tier.id === currentTier;

            return (
              <div
                key={tier.id}
                style={{
                  position: 'relative',
                  border: `1.5px solid ${isCurrent ? 'var(--terracotta)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-elev)',
                  padding: '20px 16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  overflow: 'hidden',
                }}
              >
                {/* Popular ribbon */}
                {tier.popular && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      background: 'var(--terracotta)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderBottomLeftRadius: 'var(--radius)',
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                    }}
                  >
                    Most popular
                  </div>
                )}

                {/* Current plan badge */}
                {isCurrent && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(218,119,86,0.12)',
                      color: 'var(--terracotta)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 10,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Check size={10} strokeWidth={2.5} />
                    Current plan
                  </div>
                )}

                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 18,
                    fontWeight: 500,
                    color: 'var(--text-1)',
                  }}
                >
                  {plan.label}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    ${price === 0 ? '0' : price.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>/ mo</span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-3)', minHeight: 16 }}>
                  {price === 0
                    ? 'No card required'
                    : yearly
                      ? `$${(plan.yearlyPriceUsd * 12).toFixed(0)}/yr · $${plan.monthlyPriceUsd.toFixed(2)}/mo if monthly`
                      : `$${plan.yearlyPriceUsd.toFixed(2)}/mo if billed yearly`}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                  {tier.tagline}
                </div>

                <button
                  onClick={() => !isCurrent && onUpgrade?.(tier.id)}
                  disabled={isCurrent}
                  style={{
                    padding: '8px 0',
                    border:
                      tier.ctaVariant === 'ghost'
                        ? '1px solid var(--border)'
                        : tier.ctaVariant === 'primary'
                          ? '1px solid var(--terracotta)'
                          : 'none',
                    borderRadius: 'var(--radius)',
                    background: isCurrent
                      ? 'var(--bg-soft)'
                      : tier.ctaVariant === 'teal'
                        ? 'var(--teal)'
                        : tier.ctaVariant === 'primary'
                          ? 'var(--terracotta)'
                          : 'transparent',
                    color: isCurrent
                      ? 'var(--text-3)'
                      : ['teal', 'primary'].includes(tier.ctaVariant)
                        ? '#fff'
                        : 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isCurrent ? 'default' : 'pointer',
                    marginTop: 4,
                  }}
                >
                  {isCurrent ? '✓ Current plan' : tier.cta}
                </button>

                {/* Cap rows */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginTop: 8,
                    borderTop: '1px solid var(--border)',
                    paddingTop: 12,
                  }}
                >
                  {CAP_ROWS.map((row) => {
                    const v = tier.caps[row.key];
                    const isUnl = v === -1;
                    const isZero = v === 0;
                    return (
                      <div
                        key={row.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 11,
                            color: 'var(--text-3)',
                          }}
                        >
                          <row.Icon size={11} />
                          {row.label}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: 'var(--mono)',
                            color: isUnl
                              ? 'var(--teal)'
                              : isZero
                                ? 'var(--text-3)'
                                : 'var(--text-2)',
                            fontWeight: isUnl ? 600 : 400,
                          }}
                        >
                          {fmtCap(row.key, v, row.unit)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust signals */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'center',
            padding: '16px 0',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 32,
          }}
        >
          {[
            { Icon: Cpu, text: 'BYOK + Local free forever' },
            { Icon: Shield, text: 'No training on your data' },
            { Icon: X, text: 'No silent swaps' },
            { Icon: X, text: 'No auto-overage' },
            { Icon: ArrowRight, text: 'Pause anytime' },
            { Icon: Check, text: 'Cancel in 2 clicks' },
            { Icon: Shield, text: 'Annual price-lock refund guarantee' },
          ].map(({ Icon, text }) => (
            <span
              key={text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                color: 'var(--text-3)',
              }}
            >
              <Icon size={13} style={{ color: 'var(--teal)' }} />
              {text}
            </span>
          ))}
        </div>

        {/* Spend-stack calculator */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            padding: '24px',
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
            <Cpu size={28} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 17,
                  fontWeight: 500,
                  color: 'var(--text-1)',
                }}
              >
                Replace your AI subscription stack
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                Select your current subscriptions to see how much you save.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {SPEND_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setSpendStack((s) => ({ ...s, [o.id]: !s[o.id] }))}
                style={{
                  padding: '6px 12px',
                  border: spendStack[o.id] ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: spendStack[o.id] ? 'rgba(33,128,141,0.1)' : 'transparent',
                  color: spendStack[o.id] ? 'var(--teal)' : 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: spendStack[o.id] ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {spendStack[o.id] && <Check size={11} strokeWidth={2.5} />}
                {o.label}
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>${o.price}/mo</span>
              </button>
            ))}
          </div>

          {spendTotal > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  You currently spend{' '}
                  <strong style={{ color: 'var(--text-1)' }}>${spendTotal}/mo</strong> ($
                  {spendTotal * 12}/yr).
                  {savings > 0 && (
                    <span style={{ color: 'var(--teal)', fontWeight: 600 }}>
                      {' '}
                      Save ~${Math.round(savings)}/yr with AGI Pro annual.
                    </span>
                  )}
                </span>
              </div>
              {savings > 0 && (
                <button
                  onClick={() => onUpgrade?.('pro')}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--teal)',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Switch and save ${Math.round(savings)}/yr
                </button>
              )}
            </div>
          )}
        </div>

        {/* BYOK card */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 40,
          }}
        >
          <Cpu size={28} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 17,
                fontWeight: 500,
                color: 'var(--text-1)',
              }}
            >
              Bring your own keys
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 2 }}>
              On any tier, plug in your own provider API keys to bypass our caps entirely. We never
              proxy — your requests go direct to the provider.
            </div>
          </div>
          <button
            onClick={onBYOK}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Configure BYOK
          </button>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 22,
              fontWeight: 500,
              color: 'var(--text-1)',
              marginBottom: 16,
            }}
          >
            Frequently asked questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-elev)',
                  overflow: 'hidden',
                  marginBottom: 4,
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                    {item.q}
                  </span>
                  {openFaq === i ? (
                    <ChevronUp size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  ) : (
                    <ChevronDown size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  )}
                </button>
                {openFaq === i && (
                  <div
                    style={{
                      padding: '0 16px 16px',
                      fontSize: 13,
                      color: 'var(--text-3)',
                      lineHeight: 1.6,
                    }}
                  >
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
