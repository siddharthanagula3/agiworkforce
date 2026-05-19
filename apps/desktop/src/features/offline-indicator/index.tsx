/**
 * Offline Indicator Component (Desktop)
 *
 * Displays network status and offline queue information.
 * Shows banner when offline or when items are pending sync.
 * Auto-hides when online with no pending items.
 *
 * Ported from apps/web/components/OfflineIndicator.tsx for desktop integration.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Loader, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  getSyncState,
  subscribeSyncState,
  isOnline,
  retrySync,
  SyncState,
} from '@/lib/offline/offlineSync';
import type { SyncManagerState } from '@/lib/offline/offlineSync';

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

  // Subscribe to state changes
  useEffect(() => {
    const initialState = getSyncState();
    setState(initialState);

    const unsubscribe = subscribeSyncState((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Determine visibility
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

  const handleRetry = useCallback(async () => {
    try {
      await retrySync();
    } catch {
      toast.error('Failed to retry sync. Please try again.');
    }
  }, []);

  if (!state || !isVisible) {
    return null;
  }

  // Derive severity and message from local state to avoid mismatch with global state
  const severity = ((): 'success' | 'warning' | 'error' | 'info' => {
    switch (state.state) {
      case SyncState.ONLINE:
        return state.queuedCount > 0 ? 'info' : 'success';
      case SyncState.OFFLINE:
        return state.queuedCount > 0 ? 'warning' : 'info';
      case SyncState.SYNCING:
        return 'info';
      case SyncState.ERROR:
        return 'error';
      default:
        return 'info';
    }
  })();

  const message = ((): string => {
    switch (state.state) {
      case SyncState.ONLINE:
        return state.queuedCount > 0 ? `${state.queuedCount} item(s) synced` : 'Online';
      case SyncState.OFFLINE:
        return state.queuedCount > 0 ? `Offline - ${state.queuedCount} pending` : 'Offline';
      case SyncState.SYNCING:
        return 'Syncing...';
      case SyncState.ERROR:
        return 'Sync failed - will retry';
      default:
        return 'Unknown';
    }
  })();

  const bgColor = {
    success: 'bg-green-50 dark:bg-green-950',
    info: 'bg-blue-50 dark:bg-blue-950',
    warning: 'bg-yellow-50 dark:bg-yellow-950',
    error: 'bg-red-50 dark:bg-red-950',
  }[severity];

  const borderColor = {
    success: 'border-green-200 dark:border-green-800',
    info: 'border-blue-200 dark:border-blue-800',
    warning: 'border-yellow-200 dark:border-yellow-800',
    error: 'border-red-200 dark:border-red-800',
  }[severity];

  const textColor = {
    success: 'text-green-900 dark:text-green-100',
    info: 'text-blue-900 dark:text-blue-100',
    warning: 'text-yellow-900 dark:text-yellow-100',
    error: 'text-red-900 dark:text-red-100',
  }[severity];

  const iconColor = {
    success: 'text-green-600 dark:text-green-400',
    info: 'text-blue-600 dark:text-blue-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
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
      className={`fixed ${position === 'top' ? 'top-0' : 'bottom-0'} left-0 right-0 z-50 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Network status indicator"
    >
      <div
        className={`
          mx-4 mb-4 px-4 py-3 rounded-lg border
          flex items-center justify-between gap-3
          ${bgColor} ${borderColor} ${textColor}
          transition-all duration-200 ease-in-out
        `}
      >
        <div className="flex items-center gap-3 flex-1">
          {getIcon()}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{message}</p>
            {state.state === SyncState.ERROR && state.error && (
              <p className="text-xs opacity-75">{state.error.message}</p>
            )}
            {state.lastSyncTime && state.state === SyncState.ONLINE && (
              <p className="text-xs opacity-75">Last synced: {formatTime(state.lastSyncTime)}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {state.state === SyncState.ERROR && (
            <button
              type="button"
              onClick={() => void handleRetry()}
              className={`
                px-3 py-1 rounded text-sm font-medium
                bg-red-200 hover:bg-red-300 dark:bg-red-800 dark:hover:bg-red-700
                text-red-900 dark:text-red-100
                transition-colors duration-150
              `}
              aria-label="Retry sync"
            >
              Retry
            </button>
          )}

          {state.queuedCount > 0 && state.state !== SyncState.SYNCING && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 bg-opacity-50">
              {state.queuedCount} pending
            </span>
          )}

          {state.state === SyncState.SYNCING && (
            <span className="px-2 py-1 rounded text-xs font-medium opacity-75">Syncing...</span>
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
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString();
  }
}
