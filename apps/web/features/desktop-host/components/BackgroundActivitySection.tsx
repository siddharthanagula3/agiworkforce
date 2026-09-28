'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  BackgroundActivity,
  BackgroundWorkKind,
  RemoteControlStatus,
} from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import { readBackgroundActivity, stopBackgroundWork } from '../lib/runtime-client';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';

const HEADING = 'Running on this Mac';
const HEADING_HINT =
  'What AGI Cloud keeps running in the background. Stop any of it here without quitting the app.';
const NOTHING_RUNNING = 'Nothing is running in the background.';
const LOAD_FAILED = 'What is running could not be read from the app.';
const STOP_FAILED = 'That was not stopped.';
const STOP_LABEL = 'Stop';

const REMOTE_CONTROL_HINTS: Readonly<Record<Exclude<RemoteControlStatus, 'idle'>, string>> = {
  waiting: 'Waiting for your phone to connect',
  connected: 'Your phone can reach coding sessions on this Mac',
  reconnecting: 'Reconnecting to your phone',
  error: 'Stopped by an error; stop it to clear the connection',
};

function isEmpty(activity: BackgroundActivity): boolean {
  return (
    activity.codingRuntimes.length === 0 &&
    activity.commands.length === 0 &&
    activity.computerUse === 'idle' &&
    activity.remoteControl === 'idle' &&
    !activity.browserPaired
  );
}

export function BackgroundActivitySection() {
  const host = useElectronHost();
  const [activity, setActivity] = useState<BackgroundActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);

  const refresh = useCallback(() => {
    readBackgroundActivity()
      .then((next) => {
        setActivity(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(toUserMessage(cause, LOAD_FAILED)));
  }, []);

  useEffect(() => {
    if (!host) return undefined;
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribe = host.onRuntimeEvent((event) => {
      if (
        event.kind === 'computer-use-changed' ||
        event.kind === 'remote-control-changed' ||
        event.kind === 'browser-pairing-changed' ||
        (event.kind === 'developer-session' &&
          (event.event.type === 'turn-started' || event.event.type === 'turn-finished'))
      ) {
        refresh();
      }
    });
    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribe();
    };
  }, [host, refresh]);

  const onStop = useCallback((kind: BackgroundWorkKind, id?: string) => {
    const key = `${kind}:${id ?? ''}`;
    setStopping(key);
    stopBackgroundWork(kind, id)
      .then((next) => {
        setActivity(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(toUserMessage(cause, STOP_FAILED)))
      .finally(() => setStopping(null));
  }, []);

  if (!host) return null;

  const stopButton = (label: string, kind: BackgroundWorkKind, id?: string) => (
    <button
      type="button"
      className={DESKTOP_SETTINGS_BUTTON_CLASS}
      disabled={stopping !== null}
      aria-label={`${STOP_LABEL} ${label}`}
      onClick={() => onStop(kind, id)}
    >
      {STOP_LABEL}
    </button>
  );

  return (
    <section className="flex flex-col gap-4" aria-label={HEADING}>
      <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />

      {error !== null && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {error}
        </p>
      )}

      {activity === null ? (
        error === null ? (
          <Spinner aria-label="Loading what is running" />
        ) : null
      ) : isEmpty(activity) ? (
        <p className="text-xs text-[var(--text-3)]">{NOTHING_RUNNING}</p>
      ) : (
        <div className="flex flex-col">
          {activity.codingRuntimes.map((runtime) => {
            const label = `AGI CLI in ${runtime.rootName}`;
            return (
              <DesktopSettingsRow
                key={runtime.rootId}
                label={label}
                hint={
                  runtime.workingTurns > 0
                    ? 'Working on a request now'
                    : 'Waiting for the next request in this folder'
                }
              >
                {stopButton(label, 'coding-runtime', runtime.rootId)}
              </DesktopSettingsRow>
            );
          })}
          {activity.commands.map((run) => (
            <DesktopSettingsRow
              key={run.runId}
              label={run.command}
              hint={`Running in ${run.rootName}`}
            >
              {stopButton(run.command, 'command', run.runId)}
            </DesktopSettingsRow>
          ))}
          {activity.computerUse !== 'idle' ? (
            <DesktopSettingsRow
              label="Computer use"
              hint={
                activity.computerUse === 'paused'
                  ? 'Paused while you have the screen'
                  : 'AGI is using your computer'
              }
            >
              {stopButton('computer use', 'computer-use')}
            </DesktopSettingsRow>
          ) : null}
          {activity.remoteControl !== 'idle' ? (
            <DesktopSettingsRow
              label="Remote control"
              hint={REMOTE_CONTROL_HINTS[activity.remoteControl]}
            >
              {stopButton('remote control', 'remote-control')}
            </DesktopSettingsRow>
          ) : null}
          {activity.browserPaired ? (
            <DesktopSettingsRow
              label="Chrome bridge"
              hint="Paired with the AGI extension and ready for browser commands you approve. Unpair it under Capabilities."
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
