import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../../lib/runtimeEnvironment';
import { recordLaunchOutcome } from '../../services/errorTracking';
import {
  upgradeNotice,
  type UpgradeNotice,
  type UpgradeStatus,
} from '../upgrade/localRuntimeUpgrade';
import { UpgradeNoticeBanner } from '../upgrade/UpgradeNoticeBanner';
import {
  StartupRecoveryLoading,
  StartupRecoveryScreen,
  type StartupRecoveryInfo,
} from './StartupRecoveryScreen';

export interface StartupStateReport {
  recovery: StartupRecoveryInfo | null;
  upgrade: UpgradeStatus;
}

type StartupPhase =
  | { kind: 'checking' }
  | { kind: 'ready'; notice: UpgradeNotice | null }
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
    nativeRuntime ? { kind: 'checking' } : { kind: 'ready', notice: null },
  );

  useEffect(() => {
    if (!nativeRuntime) return;

    let active = true;
    const startedAt = Date.now();
    const failLaunch = (info: StartupRecoveryInfo) => {
      recordLaunchOutcome({
        outcome: 'failed',
        reason: info.code,
        durationMs: Date.now() - startedAt,
      });
      setPhase({ kind: 'recovery', info });
    };
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      failLaunch(startupStateUnavailable);
    }, timeoutMs);

    void invokeCommand<StartupStateReport | null>('startup_get_recovery_state')
      .then((report) => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        if (report?.recovery) {
          failLaunch(report.recovery);
          return;
        }
        const notice = report ? upgradeNotice(report.upgrade) : null;
        recordLaunchOutcome({
          outcome: notice?.blocking ? 'failed' : 'succeeded',
          reason: notice?.blocking ? report?.upgrade.action : undefined,
          durationMs: Date.now() - startedAt,
        });
        setPhase({ kind: 'ready', notice });
      })
      .catch(() => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        failLaunch(startupStateUnavailable);
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [invokeCommand, nativeRuntime, timeoutMs]);

  const blocked = phase.kind === 'recovery' || (phase.kind === 'ready' && phase.notice?.blocking);

  useEffect(() => {
    if (!blocked) return;

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
  }, [blocked]);

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

  if (phase.notice?.blocking) {
    return <UpgradeNoticeBanner notice={phase.notice} />;
  }

  return (
    <>
      {phase.notice ? <UpgradeNoticeBanner notice={phase.notice} /> : null}
      {children}
    </>
  );
}
