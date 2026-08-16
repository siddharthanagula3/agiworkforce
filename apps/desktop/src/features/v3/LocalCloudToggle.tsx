import { useTranslation } from 'react-i18next';
import { Laptop, Cloud, type LucideIcon } from 'lucide-react';
import { useAppModeStore, selectMode } from '../../stores/appModeStore';

export interface LocalCloudToggleProps {
  collapsed?: boolean;
}

interface SegmentProps {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  badge?: string;
}

function Segment({
  active,
  icon: Icon,
  label,
  onClick,
  disabled = false,
  title,
  badge,
}: SegmentProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      title={title}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: 7,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background: active ? 'var(--chat-accent-primary)' : 'transparent',
        color: active ? 'var(--chat-accent-primary-contrast)' : 'var(--chat-text-secondary)',
        fontSize: 12,
        fontWeight: 600,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <Icon size={13} />
      <span>{label}</span>
      {badge ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
            padding: '1px 5px',
            borderRadius: 5,
            background: 'var(--chat-border)',
            color: 'var(--chat-text-secondary)',
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function LocalCloudToggle({ collapsed }: LocalCloudToggleProps) {
  const { t } = useTranslation('v3');
  const mode = useAppModeStore(selectMode);
  const setMode = useAppModeStore((s) => s.setMode);
  const isLocal = mode === 'local';

  const localLabel = t('sidebar.mode.local');
  const cloudLabel = t('sidebar.mode.cloud');

  if (collapsed) {
    const Icon = isLocal ? Laptop : Cloud;
    const destinationLabel = isLocal ? cloudLabel : localLabel;
    const switchLabel = t('sidebar.mode.switchTo', { mode: destinationLabel });
    return (
      <button
        type="button"
        onClick={() => setMode(isLocal ? 'cloud' : 'local')}
        title={switchLabel}
        aria-label={switchLabel}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 30,
          margin: '0 auto',
          borderRadius: 8,
          border: '1px solid var(--chat-border)',
          background: 'var(--chat-surface-elevated)',
          cursor: 'pointer',
          color: 'var(--chat-text-secondary)',
        }}
      >
        <Icon size={15} />
      </button>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={t('sidebar.mode.aria')}
      style={{
        display: 'flex',
        gap: 2,
        padding: 2,
        borderRadius: 9,
        background: 'var(--chat-surface-elevated)',
        border: '1px solid var(--chat-border)',
      }}
    >
      <Segment active={isLocal} icon={Laptop} label={localLabel} onClick={() => setMode('local')} />
      <Segment active={!isLocal} icon={Cloud} label={cloudLabel} onClick={() => setMode('cloud')} />
    </div>
  );
}
