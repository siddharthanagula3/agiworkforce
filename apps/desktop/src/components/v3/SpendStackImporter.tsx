import { useState } from 'react';
import { Cpu, Check, ArrowRight } from 'lucide-react';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';
import type { BillingPlanTier } from '@agiworkforce/types';
import { openCheckout } from '../../lib/stripeCheckout';

interface SpendOption {
  id: string;
  label: string;
  price: number;
}

const SPEND_OPTIONS: SpendOption[] = [
  { id: 'chatgpt', label: 'ChatGPT Plus', price: 20 },
  { id: 'claude', label: 'Claude Pro', price: 20 },
  { id: 'perplexity', label: 'Perplexity Pro', price: 20 },
  { id: 'cursor', label: 'Cursor Pro', price: 20 },
  { id: 'gemini', label: 'Gemini Advanced', price: 20 },
  { id: 'copilot', label: 'GitHub Copilot', price: 10 },
  { id: 'wispr', label: 'Wispr Flow', price: 15 },
  { id: 'midjourney', label: 'Midjourney', price: 30 },
  { id: 'codex', label: 'Codex (OpenAI)', price: 20 },
  { id: 'runway', label: 'Runway Gen-4', price: 15 },
];

function bestTierForSavings(monthlySpend: number): BillingPlanTier {
  if (monthlySpend >= BILLING_PLAN_PRICING.pro_plus.monthlyPriceUsd) return 'pro_plus';
  if (monthlySpend >= BILLING_PLAN_PRICING.pro.monthlyPriceUsd) return 'pro';
  return 'hobby';
}

export interface SpendStackImporterProps {
  onUpgrade?: (tier: BillingPlanTier) => void;
  onError?: (msg: string) => void;
  /** If provided, only renders the inner content without the wrapper card. */
  inline?: boolean;
}

export function SpendStackImporter({
  onUpgrade,
  onError,
  inline = false,
}: SpendStackImporterProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const monthlySpend = SPEND_OPTIONS.filter((o) => selected[o.id]).reduce(
    (sum, o) => sum + o.price,
    0,
  );
  const targetTier = bestTierForSavings(monthlySpend);
  const tierPlan = BILLING_PLAN_PRICING[targetTier];
  const yearlyEquiv = tierPlan.yearlyPriceUsd;
  const savings = monthlySpend > 0 ? Math.max(0, monthlySpend * 12 - yearlyEquiv) : 0;

  async function handleUpgrade() {
    if (onUpgrade) {
      onUpgrade(targetTier);
      return;
    }
    setLoading(true);
    const err = await openCheckout(targetTier, 'yearly');
    setLoading(false);
    if (err) onError?.(err);
  }

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <Cpu size={24} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text-1)',
            }}
          >
            Replace your AI subscription stack
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            Select what you currently pay for to see your savings.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
        {SPEND_OPTIONS.map((o) => {
          const on = !!selected[o.id];
          return (
            <button
              key={o.id}
              onClick={() => setSelected((s) => ({ ...s, [o.id]: !s[o.id] }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
                borderRadius: 'var(--radius)',
                border: on ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                background: on ? 'rgba(33,128,141,0.09)' : 'transparent',
                color: on ? 'var(--teal)' : 'var(--text-2)',
                fontSize: 12,
                fontWeight: on ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {on && <Check size={11} strokeWidth={2.5} />}
              {o.label}
              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>${o.price}/mo</span>
            </button>
          );
        })}
      </div>

      {monthlySpend > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '14px 16px',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-soft)',
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
              You currently spend{' '}
              <strong style={{ color: 'var(--text-1)' }}>${monthlySpend}/mo</strong> ($
              {monthlySpend * 12}/yr).
              {savings > 0 && (
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>
                  {' '}
                  Save ~${Math.round(savings)}/yr with AGI {tierPlan.label} annual.
                </span>
              )}
            </div>
            {savings <= 0 && monthlySpend > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                AGI {tierPlan.label} at ${tierPlan.monthlyPriceUsd}/mo replaces these with one
                subscription.
              </div>
            )}
          </div>
          <button
            onClick={() => void handleUpgrade()}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: 'var(--teal)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {loading
              ? 'Opening…'
              : savings > 0
                ? `Switch and save $${Math.round(savings)}/yr`
                : `Switch to AGI ${tierPlan.label}`}
            {!loading && <ArrowRight size={14} />}
          </button>
        </div>
      )}
    </>
  );

  if (inline) return content;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: '22px',
      }}
    >
      {content}
    </div>
  );
}
