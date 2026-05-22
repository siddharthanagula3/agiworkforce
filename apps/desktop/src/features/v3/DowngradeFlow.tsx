import { useState } from 'react';
import { ArrowDown, Check } from 'lucide-react';
import { BILLING_PLAN_PRICING, type BillingPlanTier } from '@agiworkforce/types';
import { openBillingPortal } from '../../lib/stripeCheckout';

type DowngradeTier = Extract<BillingPlanTier, 'hobby' | 'pro' | 'pro_plus'>;

const DOWNGRADE_OPTIONS: { id: DowngradeTier; loses: string[] }[] = [
  {
    id: 'pro_plus',
    loses: ['Max-tier unlimited usage', 'Priority queue'],
  },
  {
    id: 'pro',
    loses: ['Unlimited image gen', '1,500 voice min/mo', '1,000 computer-use actions/mo'],
  },
  {
    id: 'hobby',
    loses: ['Sonnet unlimited', '300 voice min/mo', 'Video gen', 'Computer use'],
  },
];

export interface DowngradeFlowProps {
  currentTier: BillingPlanTier;
  onClose: () => void;
  onError?: (msg: string) => void;
}

export function DowngradeFlow({ currentTier, onClose, onError }: DowngradeFlowProps) {
  const availableOptions = DOWNGRADE_OPTIONS.filter(
    (o) =>
      BILLING_PLAN_PRICING[o.id].monthlyPriceUsd <
      (BILLING_PLAN_PRICING[currentTier]?.monthlyPriceUsd ?? 0),
  );

  const [selected, setSelected] = useState<DowngradeTier | null>(availableOptions[0]?.id ?? null);
  const [loading, setLoading] = useState(false);

  async function handleDowngrade() {
    setLoading(true);
    const err = await openBillingPortal();
    setLoading(false);
    if (err) {
      onError?.(err);
    } else {
      onClose();
    }
  }

  if (availableOptions.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
        }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 380,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '28px 24px 24px',
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
            You are already on the lowest paid plan. To switch to free BYOK, cancel your
            subscription instead.
          </p>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '9px 0',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 24px 24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ArrowDown size={20} style={{ color: 'var(--text-2)' }} />
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text-1)',
            }}
          >
            Switch to a lower plan
          </span>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
          The change takes effect at the end of your current billing period. Your data is never
          deleted.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {availableOptions.map((opt) => {
            const plan = BILLING_PLAN_PRICING[opt.id];
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  border: `1.5px solid ${isSelected ? 'var(--border-accent, var(--border))' : 'var(--border)'}`,
                  background: isSelected ? 'var(--bg-soft)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-1)',
                      }}
                    >
                      {plan.label}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-3)',
                        fontFamily: 'var(--mono)',
                      }}
                    >
                      ${plan.monthlyPriceUsd}/mo
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    You lose: {opt.loses.join(' · ')}
                  </div>
                </div>
                {isSelected && (
                  <Check size={15} style={{ color: 'var(--teal)', flexShrink: 0, marginTop: 2 }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '9px 0',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              color: 'var(--text-2)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Keep current plan
          </button>
          <button
            onClick={() => void handleDowngrade()}
            disabled={loading || !selected}
            style={
              {
                flex: 1,
                padding: '9px 0',
                border: 'none',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-soft)',
                color: 'var(--text-1)',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading || !selected ? 'default' : 'pointer',
                opacity: loading || !selected ? 0.6 : 1,
                border2: '1px solid var(--border)',
              } as React.CSSProperties
            }
          >
            {loading
              ? 'Opening portal…'
              : selected
                ? `Switch to ${BILLING_PLAN_PRICING[selected].label}`
                : 'Select a plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
