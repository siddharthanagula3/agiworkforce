import { spawn, type ChildProcess } from 'node:child_process';

import { log } from './log.ts';

const CLAMD_CONFIG = '--config-file=/etc/clamav/clamd.conf';
const FRESHCLAM_CONFIG = '--config-file=/etc/clamav/freshclam.conf';
const SIGNATURE_REFRESH_TIMEOUT_MS = 120_000;
const FRESHCLAM_RESTART_DELAY_MS = 60 * 60 * 1000;
const CLAMD_PROBE_INTERVAL_MS = 30_000;
const CLAMD_UNRESPONSIVE_LIMIT_MS = 5 * 60 * 1000;

export interface Daemon {
  stop: () => void;
}

type Ending = { code: number | null; signal: NodeJS.Signals | null } | { error: string };

function ended(child: ChildProcess): Promise<Ending> {
  return new Promise((resolve) => {
    child.on('error', (error) => resolve({ error: error.message }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

export async function refreshSignatures(): Promise<void> {
  const ending = await ended(
    spawn('freshclam', [FRESHCLAM_CONFIG, '--stdout'], {
      stdio: 'inherit',
      timeout: SIGNATURE_REFRESH_TIMEOUT_MS,
    }),
  );
  if (!('code' in ending) || ending.code !== 0) log('warn', 'signature_refresh_failed', ending);
}

export function startClamd(onExit: () => void): Daemon {
  let stopping = false;
  const clamd = spawn('clamd', [CLAMD_CONFIG, '--foreground'], { stdio: 'inherit' });
  void ended(clamd).then((ending) => {
    if (stopping) return;
    log('error', 'clamd_exited', ending);
    onExit();
  });
  return {
    stop: () => {
      stopping = true;
      clamd.kill('SIGTERM');
    },
  };
}

export function startFreshclam(restartDelayMs = FRESHCLAM_RESTART_DELAY_MS): Daemon {
  let stopping = false;
  let current: ChildProcess | undefined;
  let restart: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    current = spawn('freshclam', [FRESHCLAM_CONFIG, '--daemon', '--foreground', '--stdout'], {
      stdio: 'inherit',
    });
    void ended(current).then((ending) => {
      if (stopping) return;
      log('error', 'freshclam_exited', { ...ending, restartInMs: restartDelayMs });
      restart = setTimeout(run, restartDelayMs);
    });
  };
  run();
  return {
    stop: () => {
      stopping = true;
      clearTimeout(restart);
      current?.kill('SIGTERM');
    },
  };
}

export function watchClamd(
  scans: () => Promise<boolean>,
  onUnresponsive: () => void,
  intervalMs = CLAMD_PROBE_INTERVAL_MS,
  limitMs = CLAMD_UNRESPONSIVE_LIMIT_MS,
): Daemon {
  let scannedAt = Date.now();
  let stopped = false;
  const timer = setInterval(() => {
    void scans().then((scanning) => {
      if (stopped) return;
      if (scanning) {
        scannedAt = Date.now();
        return;
      }
      const silentMs = Date.now() - scannedAt;
      if (silentMs < limitMs) return;
      stopped = true;
      clearInterval(timer);
      log('error', 'clamd_unresponsive', { silentMs });
      onUnresponsive();
    });
  }, intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
