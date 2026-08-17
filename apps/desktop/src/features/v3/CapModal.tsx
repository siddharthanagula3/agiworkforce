import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, X } from 'lucide-react';
import { useBudgetStore, selectBudget, selectBudgetPercentage } from '@agiworkforce/unified-chat';

interface CapModalProps {
  onSwitchModel?: () => void;
}

export function CapModal({ onSwitchModel }: CapModalProps) {
  const { t } = useTranslation('v3');
  const budget = useBudgetStore(selectBudget);
  const usagePercent = useBudgetStore(selectBudgetPercentage);
  const [waitDismissed, setWaitDismissed] = useState(false);

  const atCap = budget.enabled && usagePercent >= 100;

  useEffect(() => {
    if (!atCap) {
      setWaitDismissed(false);
    }
  }, [atCap]);

  if (!atCap || waitDismissed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cap-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-component="cap-modal"
    >
      <div
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--chat-surface-overlay) 80%, transparent)' }}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{
          background: 'var(--chat-surface-elevated)',
          borderColor: 'var(--chat-destructive)',
          boxShadow: 'var(--chat-shadow-lg)',
        }}
      >
        <div className="flex items-start gap-3">
          <AlertOctagon
            className="h-6 w-6 shrink-0"
            style={{ color: 'var(--chat-destructive)' }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <h2
              id="cap-modal-title"
              className="text-base font-semibold"
              style={{ color: 'var(--chat-text-primary)' }}
            >
              {t('capModal.title')}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--chat-text-secondary)' }}>
              {t('capModal.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWaitDismissed(true)}
            aria-label={t('capModal.dismiss')}
            className="rounded p-1 transition-colors hover:bg-[var(--chat-surface-hover)]"
            style={{ color: 'var(--chat-text-muted)' }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {onSwitchModel && (
            <button
              type="button"
              onClick={onSwitchModel}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'var(--chat-accent-primary)',
                color: 'var(--chat-surface-elevated)',
              }}
            >
              {t('capModal.switchModel')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setWaitDismissed(true)}
            className="text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--chat-text-muted)' }}
          >
            {t('capModal.waitReset')}
          </button>
        </div>
      </div>
    </div>
  );
}
