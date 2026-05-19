import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrainCircuit, ChevronRight } from 'lucide-react';

export interface ThinkingPillProps {
  summary?: string;
  details?: string;
  durationSeconds?: number;
}

export function ThinkingPill({ summary, details, durationSeconds }: ThinkingPillProps) {
  const { t } = useTranslation('v3');
  const [open, setOpen] = useState(false);

  const label =
    summary ??
    (durationSeconds != null
      ? t('thinking.reasonedFor', { seconds: durationSeconds })
      : t('thinking.reasoned'));

  return (
    <div data-v3-thinking-pill="" style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 10px 3px 7px',
          borderRadius: 20,
          border: '1px solid var(--chat-border)',
          background: 'var(--chat-surface-elevated)',
          cursor: 'pointer',
          color: 'var(--chat-text-secondary)',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        <BrainCircuit size={13} style={{ color: 'var(--chat-accent-secondary)', flexShrink: 0 }} />
        <span>{label}</span>
        <ChevronRight
          size={12}
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
            flexShrink: 0,
          }}
        />
      </button>

      {open && details && (
        <div
          style={{
            marginTop: 6,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--chat-border)',
            background: 'var(--chat-surface-elevated)',
            color: 'var(--chat-text-secondary)',
            fontSize: 13,
            lineHeight: 1.6,
            fontStyle: 'italic',
          }}
        >
          {details}
        </div>
      )}
    </div>
  );
}
