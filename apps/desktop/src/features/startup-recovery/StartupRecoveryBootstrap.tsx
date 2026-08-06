import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../../lib/runtimeEnvironment';
import {
  StartupRecoveryLoading,
  StartupRecoveryScreen,
  type StartupRecoveryInfo,
} from './StartupRecoveryScreen';

type StartupPhase =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'recovery'; info: StartupRecoveryInfo };

export type StartupRecoveryInvoke = <T>(command: string) => Promise<T>;

const invokeNative: StartupRecoveryInvoke = <T,>(command: string) => invoke<T>(command);

const startupStateUnavailable: StartupRecoveryInfo = {
  code: 'STARTUP_STATE_UNAVAILABLE',
  title: 'AGI could not verify local data',
  message:
    'The native startup check did not respond. Retry the app, then export diagnostics if the problem continues.',
  dataPreserved: true,
};

/**
 * How long to wait for `startup_get_recovery_state` before treating the native
 * side as unresponsive.
 *
 * The command itself only reads a mutex-guarded Option, so a healthy backend
 * answers in microseconds; anything approaching this bound means the response
 * is not coming back at all. Without a bound, a promise that never settles
 * (rather than rejecting) leaves the user on an unrecoverable "Opening
 * encrypted local data…" spinner with no retry, no diagnostics, and no quit —
 * observed in a `tauri dev` session whose backend was provably idle in its
 * event loop. STARTUP_STATE_UNAVAILABLE was written for exactly this case but
 * was only reachable on rejection.
 */
const STARTUP_STATE_TIMEOUT_MS = 10_000;

interface StartupRecoveryBootstrapProps {
  children: ReactNode;
  nativeRuntime?: boolean;
  invokeCommand?: StartupRecoveryInvoke;
  timeoutMs?: number;
}

export function StartupRecoveryBootstrap({
  children,
  nativeRuntime = isTauri,
  invokeCommand = invokeNative,
  timeoutMs = STARTUP_STATE_TIMEOUT_MS,
}: StartupRecoveryBootstrapProps) {
  const [phase, setPhase] = useState<StartupPhase>(() =>
    nativeRuntime ? { kind: 'checking' } : { kind: 'ready' },
  );

  useEffect(() => {
    if (!nativeRuntime) return;

    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      setPhase({ kind: 'recovery', info: startupStateUnavailable });
    }, timeoutMs);

    void invokeCommand<StartupRecoveryInfo | null>('startup_get_recovery_state')
      .then((info) => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        setPhase(info ? { kind: 'recovery', info } : { kind: 'ready' });
      })
      .catch(() => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        setPhase({ kind: 'recovery', info: startupStateUnavailable });
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [invokeCommand, nativeRuntime, timeoutMs]);

  useEffect(() => {
    if (phase.kind !== 'recovery') return;

    const previousTitle = document.title;
    const previousHtmlBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    document.title = 'AGI — Local data recovery';
    // WebKit's native screenshot surface can include the WebView overscroll
    // gutter beyond the React root. Cover the document itself so recovery
    // never flashes the normal light theme around the full-height screen.
    document.documentElement.style.backgroundColor = '#080b10';
    document.body.style.backgroundColor = '#080b10';
    return () => {
      document.title = previousTitle;
      document.documentElement.style.backgroundColor = previousHtmlBackground;
      document.body.style.backgroundColor = previousBodyBackground;
    };
  }, [phase.kind]);

  if (phase.kind === 'checking') {
    return <StartupRecoveryLoading />;
  }

  if (phase.kind === 'recovery') {
    return (
      <StartupRecoveryScreen
        info={phase.info}
        onRetry={() => invokeCommand<void>('startup_retry')}
        onOpenDataFolder={() => invokeCommand<void>('startup_open_data_folder')}
        onExportDiagnostics={() => invokeCommand<boolean>('startup_export_diagnostics')}
        onQuit={() => invokeCommand<void>('startup_quit')}
      />
    );
  }

  return children;
}
