'use client';

import { useEffect, useState } from 'react';
import type { HostBridge, HostUpdateAvailability } from '@agiworkforce/local-runtime-contract';
import { getItem, setItem } from '@shared/utils/localStorage';

const LAST_CHECK_KEY = 'agi-desktop-update-last-check:v1';
const DISMISSED_VERSION_KEY = 'agi-desktop-update-dismissed-version:v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export function DesktopUpdateNotice({ host }: { host: HostBridge }) {
  const [update, setUpdate] = useState<HostUpdateAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      setItem(LAST_CHECK_KEY, Date.now());
      try {
        const result = await host.checkForUpdate();
        if (
          !cancelled &&
          result.available &&
          getItem<string | null>(DISMISSED_VERSION_KEY, null) !== result.version
        ) {
          setUpdate(result);
        }
      } catch {
        // The manual Settings row owns update-check errors and retry.
      }
    };

    const elapsed = Date.now() - getItem<number>(LAST_CHECK_KEY, 0);
    const firstDelay = Math.max(0, CHECK_INTERVAL_MS - elapsed);
    timer = setTimeout(() => {
      void check();
      timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    }, firstDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [host]);

  if (!update) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[var(--z-popover)] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">AGI Cloud {update.version} is available</p>
        <p className="text-xs text-muted-foreground">
          Download the signed macOS installer when you are ready.
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        onClick={() => void host.openUpdateInstaller()}
      >
        Download installer
      </button>
      <button
        type="button"
        className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => {
          setItem(DISMISSED_VERSION_KEY, update.version);
          setUpdate(null);
        }}
      >
        Later
      </button>
    </aside>
  );
}
