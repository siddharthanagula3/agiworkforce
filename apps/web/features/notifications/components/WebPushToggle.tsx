'use client';

import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@agiworkforce/ui';
import {
  disableWebPush,
  enableWebPush,
  isWebPushSupported,
  readNotificationPermission,
  registerNotificationWorker,
} from '../lib/web-push-client';

type ToggleState = 'unsupported' | 'blocked' | 'off' | 'on';

const STATE_DESCRIPTION: Record<ToggleState, string> = {
  unsupported: 'This browser cannot receive notifications.',
  blocked: 'Notifications are blocked for this site in your browser settings.',
  off: 'Get told when a run finishes, fails, or needs your approval.',
  on: 'This browser will be notified when a run finishes.',
};

export interface WebPushToggleState {
  checked: boolean;
  disabled: boolean;
  blocked: boolean;
  description: string;
  onCheckedChange: (next: boolean) => void;
}

export function useWebPushToggle(): WebPushToggleState {
  const [state, setState] = useState<ToggleState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isWebPushSupported()) return undefined;

    let active = true;
    void (async () => {
      const registration = await registerNotificationWorker();
      const subscription = await registration?.pushManager.getSubscription();
      if (!active) return;
      if (readNotificationPermission() === 'denied') {
        setState('blocked');
        return;
      }
      setState(subscription ? 'on' : 'off');
    })();

    return () => {
      active = false;
    };
  }, []);

  const change = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      if (!next) {
        await disableWebPush();
        setState('off');
        return;
      }
      const result = await enableWebPush();
      setState(result === 'enabled' ? 'on' : result === 'denied' ? 'blocked' : 'off');
    } finally {
      setBusy(false);
    }
  }, []);

  const interactive = state === 'off' || state === 'on';

  return {
    checked: state === 'on',
    disabled: busy || !interactive,
    blocked: state === 'blocked',
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
