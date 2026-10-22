'use client';

import { useEffect, useState } from 'react';
import type { HostBridge, HostUpdateAvailability } from '@agiworkforce/local-runtime-contract';
import { getItem, setItem } from '@shared/utils/localStorage';
import { installUpdate, type UpdateInstallFeedback } from '../lib/update-install';

const LAST_CHECK_KEY = 'agi-desktop-update-last-check:v1';
const DISMISSED_VERSION_KEY = 'agi-desktop-update-dismissed-version:v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

function InstallFeedback({
  feedback,
  fallback,
}: {
  feedback: UpdateInstallFeedback | null;
  fallback: string;
}) {
  if (feedback?.kind === 'error') {
    return (
      <p role="alert" className="text-xs text-destructive-text">
        {feedback.message}
      </p>
    );
  }
  return <p className="text-xs text-muted-foreground">{feedback?.message ?? fallback}</p>;
}

export function DesktopUpdateNotice({ host }: { host: HostBridge }) {
  const [update, setUpdate] = useState<HostUpdateAvailability | null>(null);
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<UpdateInstallFeedback | null>(null);

  useEffect(
    () =>
      host.onRuntimeEvent((event) => {
        if (event.kind === 'update-ready') setReadyVersion(event.version);
      }),
    [host],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      setItem(LAST_CHECK_KEY, Date.now());
      try {
        const result = await host.checkForUpdate();
        if (cancelled) return;
        if (result.readyToInstall) {
          setReadyVersion(result.version);
        } else if (
          result.available &&
          !result.installsAutomatically &&
          !result.downloading &&
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

  const install = async (restart: boolean) => {
    setFeedback(null);
    setFeedback(await installUpdate(host, restart));
  };

  const canRestart = host.restartToUpdate !== undefined;

  if (readyVersion) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-lg"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">AGI Desktop {readyVersion} is ready to install</p>
          <InstallFeedback
            feedback={feedback}
            fallback={
              canRestart
                ? 'Restart to finish updating. Your chats are saved in your account.'
                : 'Download the signed macOS installer to finish updating. Your chats are saved in your account.'
            }
          />
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          onClick={() => void install(canRestart)}
        >
          {canRestart ? 'Restart to update' : 'Download installer'}
        </button>
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => {
            setFeedback(null);
            setReadyVersion(null);
          }}
        >
          Later
        </button>
      </aside>
    );
  }

  if (!update) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">AGI Desktop {update.version} is available</p>
        <InstallFeedback
          feedback={feedback}
          fallback="Download the signed macOS installer when you are ready."
        />
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        onClick={() => void install(false)}
      >
        Download installer
      </button>
      <button
        type="button"
        className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => {
          setItem(DISMISSED_VERSION_KEY, update.version);
          setFeedback(null);
          setUpdate(null);
        }}
      >
        Later
      </button>
    </aside>
  );
}
