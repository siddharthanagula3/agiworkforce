import { WifiOff } from 'lucide-react';
import { selectIsCloud, useAppModeStore } from '../../stores/appModeStore';

export const CLOUD_OFFLINE_MESSAGE = "You're offline. Reconnect to send messages.";
export const LOCAL_OFFLINE_MESSAGE =
  "You're offline. Only local models are available until you reconnect.";

export function OfflineIndicator() {
  const isOnline = useAppModeStore((state) => state.isOnline);
  const isCloud = useAppModeStore(selectIsCloud);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="flex items-center gap-2 border-b border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] px-4 py-2 text-sm text-[var(--chat-warning-fg)]"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{isCloud ? CLOUD_OFFLINE_MESSAGE : LOCAL_OFFLINE_MESSAGE}</span>
    </div>
  );
}
