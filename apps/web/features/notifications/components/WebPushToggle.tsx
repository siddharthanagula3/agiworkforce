'use client';

import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  disableWebPush,
  enableWebPush,
  isWebPushSupported,
  readNotificationPermission,
  readNotificationWorker,
} from '../lib/web-push-client';
import { isDesktopHost } from '@/features/desktop-host/lib/host';

type ToggleState = 'unsupported' | 'desktop' | 'blocked' | 'off' | 'on';

const STATE_DESCRIPTION: Record<ToggleState, string> = {
  unsupported: 'Browser push is unavailable here.',
  desktop:
    'The desktop app uses system notifications. Manage Agent notifications in General desktop settings.',
  blocked: 'Notifications are blocked for this site in your browser settings.',
  off: 'Get told when a run finishes, fails, or needs your approval.',
  on: 'Registered in this browser.',
};

export interface WebPushToggleState {
  checked: boolean;
  disabled: boolean;
  unavailable: boolean;
  description: string;
  onCheckedChange: (next: boolean) => void;
}

export function useWebPushToggle(): WebPushToggleState {
  const [state, setState] = useState<ToggleState>('unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDesktopHost()) {
      setState('desktop');
      return undefined;
    }
    if (!isWebPushSupported()) return undefined;

    let active = true;
    let refreshId = 0;
    const refresh = async () => {
      const currentRefreshId = ++refreshId;
      const registration = await readNotificationWorker();
      const subscription = await registration?.pushManager.getSubscription().catch(() => null);
      if (!active || currentRefreshId !== refreshId) return;
      setSubscribed(Boolean(subscription));
      if (readNotificationPermission() === 'denied') {
        setState('blocked');
        return;
      }
      setState(subscription ? 'on' : 'off');
    };
    const refreshOnFocus = () => void refresh();
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      active = false;
      refreshId += 1;
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, []);

  const change = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      if (!next) {
        await disableWebPush();
        setSubscribed(false);
        setState('off');
        return;
      }
      const result = await enableWebPush();
      setSubscribed(result === 'enabled');
      setState(result === 'enabled' ? 'on' : result === 'denied' ? 'blocked' : 'off');
    } finally {
      setBusy(false);
    }
  }, []);

  const interactive = state === 'off' || state === 'on';

  return {
    checked: subscribed,
    disabled: busy || !interactive,
    unavailable: !interactive,
    description: STATE_DESCRIPTION[state],
    onCheckedChange: (next) => void change(next),
  };
}

/**
 * The durable way back in after the one-time offer was dismissed or denied,
 * and the only place a user can turn this browser off again.
 */
export function WebPushToggle() {
  const { checked, disabled, description, onCheckedChange } = useWebPushToggle();

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Browser notifications</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label="Browser notifications"
      />
    </div>
  );
}
