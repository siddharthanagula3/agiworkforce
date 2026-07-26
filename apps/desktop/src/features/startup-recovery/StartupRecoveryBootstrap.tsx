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

interface StartupRecoveryBootstrapProps {
  children: ReactNode;
  nativeRuntime?: boolean;
  invokeCommand?: StartupRecoveryInvoke;
}

export function StartupRecoveryBootstrap({
  children,
  nativeRuntime = isTauri,
  invokeCommand = invokeNative,
}: StartupRecoveryBootstrapProps) {
  const [phase, setPhase] = useState<StartupPhase>(() =>
    nativeRuntime ? { kind: 'checking' } : { kind: 'ready' },
  );

  useEffect(() => {
    if (!nativeRuntime) return;

    let active = true;
    void invokeCommand<StartupRecoveryInfo | null>('startup_get_recovery_state')
      .then((info) => {
        if (!active) return;
        setPhase(info ? { kind: 'recovery', info } : { kind: 'ready' });
      })
      .catch(() => {
        if (active) {
          setPhase({ kind: 'recovery', info: startupStateUnavailable });
        }
      });

    return () => {
      active = false;
    };
  }, [invokeCommand, nativeRuntime]);

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
