import { useTranslation } from 'react-i18next';
import { Laptop, Cloud, type LucideIcon } from 'lucide-react';
import { useAppModeStore, selectMode } from '../../stores/appModeStore';

/**
 * Bottom-of-sidebar Local↔Cloud toggle — the primary mode nav.
 *
 * Local  = on-device LLMs + BYOK keys (no AGI-funded compute).
 * Cloud  = AGI Cloud managed models.
 *
 * Switching delegates to appModeStore.setMode, which enforces the trust-boundary
 * guards (Cloud requires a signed-in, eligible account; Local requires the
 * desktop runtime; neither switches mid-stream) and surfaces a toast on refusal.
 */
export interface LocalCloudToggleProps {
  collapsed?: boolean;
}

interface SegmentProps {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

function Segment({ active, icon: Icon, label, onClick }: SegmentProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: 7,
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--chat-accent-primary)' : 'transparent',
        color: active ? 'var(--chat-accent-primary-contrast)' : 'var(--chat-text-secondary)',
        fontSize: 12,
        fontWeight: 600,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <Icon size={13} />
      <span>{label}</span>
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
    return (
      <button
        type="button"
        onClick={() => setMode(isLocal ? 'cloud' : 'local')}
        title={isLocal ? localLabel : cloudLabel}
        aria-label={isLocal ? localLabel : cloudLabel}
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
