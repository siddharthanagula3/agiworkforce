'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader, Wifi, WifiOff } from 'lucide-react';
import {
  initializeSyncManager,
  cleanupSyncManager,
  getSyncState,
  subscribeSyncState,
  getStatusMessage,
  getStatusSeverity,
  isOnline,
  retrySync,
  SyncState,
} from '@/lib/offline/offlineSync';
import type { SyncManagerState } from '@/lib/offline/offlineSync';
import { toUserMessage } from '@/lib/user-error-message';

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom';

  className?: string;

  alwaysShow?: boolean;
}

export function OfflineIndicator({
  position = 'bottom',
  className = '',
  alwaysShow = false,
}: OfflineIndicatorProps) {
  const [state, setState] = useState<SyncManagerState | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    initializeSyncManager();

    return () => {
      cleanupSyncManager();
    };
  }, []);

  useEffect(() => {
    const initialState = getSyncState();
    setState(initialState);

    const unsubscribe = subscribeSyncState((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!state) {
      setIsVisible(false);
      return;
    }

    const shouldShow =
      alwaysShow ||
      !isOnline() ||
      state.queuedCount > 0 ||
      state.state === SyncState.SYNCING ||
      state.state === SyncState.ERROR;

    setIsVisible(shouldShow);
  }, [state, alwaysShow]);

  if (!state || !isVisible) {
    return null;
  }

  const severity = getStatusSeverity();
  const message = getStatusMessage();

  const bgColor = {
    success: 'bg-success-fill/10',
    info: 'bg-info-fill/10',
    warning: 'bg-warning-fill/10',
    error: 'bg-destructive/10',
  }[severity];

  const borderColor = {
    success: 'border-success-fill/30',
    info: 'border-info-fill/30',
    warning: 'border-warning-fill/30',
    error: 'border-destructive/30',
  }[severity];

  const textColor = {
    success: 'text-success-text',
    info: 'text-info-text',
    warning: 'text-warning-text',
    error: 'text-danger-text',
  }[severity];

  const iconColor = {
    success: 'text-success-text',
    info: 'text-info-text',
    warning: 'text-warning-text',
    error: 'text-danger-text',
  }[severity];

  const getIcon = () => {
    switch (state.state) {
      case SyncState.SYNCING:
        return <Loader className={`w-4 h-4 animate-spin ${iconColor}`} />;
      case SyncState.ERROR:
        return <AlertCircle className={`w-4 h-4 ${iconColor}`} />;
      case SyncState.OFFLINE:
        return <WifiOff className={`w-4 h-4 ${iconColor}`} />;
      case SyncState.ONLINE:
        return state.queuedCount > 0 ? (
          <Loader className={`w-4 h-4 animate-spin ${iconColor}`} />
        ) : (
          <Check className={`w-4 h-4 ${iconColor}`} />
        );
      default:
        return <Wifi className={`w-4 h-4 ${iconColor}`} />;
    }
  };

  return (
    <div
      className={`pointer-events-none fixed ${position}-0 left-0 right-0 z-[var(--z-notification)] ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Network status indicator"
    >
      <div
        className={`
          pointer-events-auto mx-4 mb-4 px-4 py-3 rounded-lg border
          flex items-center justify-between gap-3
          ${bgColor} ${borderColor} ${textColor}
          transition-all duration-quick ease-standard
        `}
      >
        <div className="flex items-center gap-3 flex-1">
          {getIcon()}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{message}</p>
            {state.state === SyncState.ERROR && state.error && (
              <p className="text-xs opacity-75">
                {toUserMessage(state.error, 'Sync did not finish. Retry when you are online.')}
              </p>
            )}
            {state.lastSyncTime && state.state === SyncState.ONLINE && (
              <p className="text-xs opacity-75">Last synced: {formatTime(state.lastSyncTime)}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {state.state === SyncState.ERROR && (
            <button
              onClick={() => retrySync()}
              className={`
                px-3 py-1 rounded-compact text-sm font-medium
                bg-destructive/15 hover:bg-destructive/25
                text-danger-text
                transition-colors duration-quick
              `}
              aria-label="Retry sync"
            >
              Retry
            </button>
          )}

          {state.queuedCount > 0 && state.state !== SyncState.SYNCING && (
            <span className="px-2 py-1 rounded-compact text-xs font-medium bg-opacity-50">
              {state.queuedCount} pending
            </span>
          )}

          {state.state === SyncState.SYNCING && (
            <span className="px-2 py-1 rounded-compact text-xs font-medium opacity-75">Syncing…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) {
    return 'just now';
  }
  if (diffMins < 60) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-diffMins, 'minute');
  }
  if (diffHours < 24) {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-diffHours, 'hour');
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
