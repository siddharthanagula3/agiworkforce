import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { openBillingPortal } from '../../lib/stripeCheckout';

const CANCEL_REASONS = [
  { id: 'too_expensive', label: 'Too expensive' },
  { id: 'not_using', label: 'Not using it enough' },
  { id: 'missing_features', label: 'Missing features I need' },
  { id: 'switching', label: 'Switching to another tool' },
  { id: 'temporary', label: 'Temporary — I will be back' },
  { id: 'other', label: 'Other' },
];

export interface CancelFlowProps {
  onClose: () => void;
  onError?: (msg: string) => void;
}

export function CancelFlow({ onClose, onError }: CancelFlowProps) {
  const [step, setStep] = useState<'confirm' | 'reason'>('confirm');
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    const err = await openBillingPortal();
    setLoading(false);
    if (err) {
      onError?.(err);
    } else {
      onClose();
    }
  }

  if (step === 'confirm') {
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
            boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <XCircle size={20} style={{ color: '#e05c4a' }} />
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--text-1)',
              }}
            >
              Cancel subscription
            </span>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.5 }}>
            Your plan stays active until the end of the current billing period. Your data is never
            deleted — you can reactivate anytime.
          </p>

          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
            Consider pausing instead — it freezes billing for 1–6 months and keeps everything
            intact.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => setStep('reason')}
              style={{
                padding: '9px 0',
                border: 'none',
                borderRadius: 'var(--radius)',
                background: '#e05c4a',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continue to cancel
            </button>
            <button
              onClick={onClose}
              style={{
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
          </div>
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
          width: 400,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 24px 24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-1)',
            marginBottom: 14,
          }}
        >
          Quick feedback (optional)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {CANCEL_REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setReason(reason === r.id ? null : r.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 'var(--radius)',
                border: `1.5px solid ${reason === r.id ? '#e05c4a' : 'var(--border)'}`,
                background: reason === r.id ? 'rgba(224,92,74,0.06)' : 'transparent',
                color: 'var(--text-2)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: `2px solid ${reason === r.id ? '#e05c4a' : 'var(--border)'}`,
                  background: reason === r.id ? '#e05c4a' : 'transparent',
                  flexShrink: 0,
                }}
              />
              {r.label}
            </button>
          ))}
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
            onClick={() => void handleCancel()}
            disabled={loading}
            style={{
              flex: 1,
              padding: '9px 0',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: '#e05c4a',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Opening portal…' : 'Cancel subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}
