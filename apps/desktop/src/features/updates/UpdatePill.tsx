import { RefreshCw } from 'lucide-react';
import { useUpdater } from './useUpdater';

interface UpdatePillProps {
  collapsed?: boolean;
  onUpdateNow?: () => void;
}

/**
 * Sidebar pill that shows "Restart to update to vX.Y.Z" when an update is available.
 * Matches the Claude.app sidebar update indicator pattern.
 * Renders nothing when no update is available or downloaded.
 */
export function UpdatePill({ collapsed = false, onUpdateNow }: UpdatePillProps) {
  const { status, updateInfo, downloadAndInstall } = useUpdater();

  if (status !== 'available' && status !== 'downloaded' && status !== 'downloading') {
    return null;
  }

  const handleClick = () => {
    if (onUpdateNow) {
      onUpdateNow();
    } else {
      void downloadAndInstall();
    }
  };

  const label =
    status === 'downloaded'
      ? `Restart to update to v${updateInfo?.version ?? '...'}`
      : status === 'downloading'
        ? 'Downloading update...'
        : `Update to v${updateInfo?.version ?? '...'}`;

  return (
    <button
      onClick={handleClick}
      title={label}
      data-testid="update-pill"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 6,
        padding: collapsed ? '6px' : '6px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8,
        border: '1px solid var(--chat-info)',
        background: 'color-mix(in srgb, var(--chat-info) 12%, transparent)',
        cursor: status === 'downloading' ? 'default' : 'pointer',
        width: '100%',
        color: 'var(--chat-info)',
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <RefreshCw
        size={13}
        style={{
          flexShrink: 0,
          animation: status === 'downloading' ? 'spin 1s linear infinite' : undefined,
        }}
      />
      {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
    </button>
  );
}

export default UpdatePill;
