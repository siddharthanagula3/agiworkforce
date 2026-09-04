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
    document.title = 'AGI, Local data recovery';
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
