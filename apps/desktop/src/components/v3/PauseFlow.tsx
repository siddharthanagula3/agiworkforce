import { useState } from 'react';
import { PauseCircle, Shield, Check } from 'lucide-react';
import { openBillingPortal } from '../../lib/stripeCheckout';

type PauseDuration = 1 | 3 | 6;

const PAUSE_OPTIONS: { months: PauseDuration; label: string; hint: string }[] = [
  { months: 1, label: '1 month', hint: 'Short break — resumes automatically' },
  { months: 3, label: '3 months', hint: 'Quarter off — most common' },
  { months: 6, label: '6 months', hint: 'Longest pause available' },
];

export interface PauseFlowProps {
  onClose: () => void;
  onError?: (msg: string) => void;
}

export function PauseFlow({ onClose, onError }: PauseFlowProps) {
  const [selected, setSelected] = useState<PauseDuration>(1);
  const [loading, setLoading] = useState(false);

  async function handlePause() {
    setLoading(true);
    // Pause is managed via the Stripe Billing Portal
    const err = await openBillingPortal();
    setLoading(false);
    if (err) {
      onError?.(err);
    } else {
      onClose();
    }
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
          width: 400,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 24px 24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <PauseCircle size={20} style={{ color: 'var(--teal)' }} />
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text-1)',
            }}
          >
            Pause your subscription
          </span>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
          Your memory, projects, and history are preserved throughout the pause. Resumes
          automatically at the end of the chosen period. No data deleted.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {PAUSE_OPTIONS.map((opt) => (
            <button
              key={opt.months}
              onClick={() => setSelected(opt.months)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 'var(--radius)',
                border: `1.5px solid ${selected === opt.months ? 'var(--teal)' : 'var(--border)'}`,
                background: selected === opt.months ? 'rgba(33,128,141,0.08)' : 'var(--bg-soft)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: selected === opt.months ? 600 : 400,
                    color: 'var(--text-1)',
                  }}
                >
                  {opt.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{opt.hint}</div>
              </div>
              {selected === opt.months && (
                <Check size={15} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 20,
            padding: '10px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(33,128,141,0.06)',
            border: '1px solid rgba(33,128,141,0.2)',
          }}
        >
          <Shield size={13} style={{ color: 'var(--teal)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Pausing continues in the Stripe billing portal. Select "Pause subscription" after
            sign-in.
          </span>
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
            Keep subscription
          </button>
          <button
            onClick={() => void handlePause()}
            disabled={loading}
            style={{
              flex: 1,
              padding: '9px 0',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: 'var(--teal)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Opening portal…' : `Pause for ${selected} month${selected > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
