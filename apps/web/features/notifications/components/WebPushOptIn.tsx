'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/identity/client';
import { Bell, X } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import {
  enableWebPush,
  fetchVapidPublicKey,
  isWebPushSupported,
  readNotificationPermission,
  registerNotificationWorker,
  syncExistingSubscription,
} from '../lib/web-push-client';

const DISMISSED_STORAGE_KEY = 'agi.web-push.offer-dismissed';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
  } catch {
    // A browser with storage blocked simply gets the offer again next session.
  }
}

/**
 * The offer to turn on run notifications.
 *
 * Mounting it never asks for permission. The browser prompt is raised only by
 * the button below, so the request always arrives on a click the user made
 * knowing what it is for, a prompt fired on page load is the one browsers
 * penalise and users deny permanently.
 */
export function WebPushOptIn() {
  const { isSignedIn } = useSession();
  const [offered, setOffered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !isWebPushSupported()) return undefined;

    let active = true;
    void (async () => {
      await registerNotificationWorker();

      const permission = readNotificationPermission();
      if (permission === 'granted') {
        await syncExistingSubscription();
        return;
      }
      if (permission === 'denied' || wasDismissed()) return;

      const publicKey = await fetchVapidPublicKey();
      if (active && publicKey) setOffered(true);
    })();

    return () => {
      active = false;
    };
  }, [isSignedIn]);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setOffered(false);
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      await enableWebPush();
    } finally {
      setBusy(false);
      setOffered(false);
    }
  }, []);

  if (!offered) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))]"
      role="region"
      aria-label="Run notifications"
    >
      <div className="relative rounded-lg border bg-card p-4 shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-3 pr-6">
            <div>
              <p className="text-sm font-medium">Know when a run finishes</p>
              <p className="text-sm text-muted-foreground">
                Get a notification when an agent run finishes, fails, or needs your approval. No run
                output ever leaves the app.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void turnOn()} disabled={busy}>
                {busy ? 'Turning on…' : 'Turn on'}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
