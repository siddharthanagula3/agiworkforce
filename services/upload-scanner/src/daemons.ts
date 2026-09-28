import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import { log } from './log.ts';

const CLAMD_CONFIG = '--config-file=/etc/clamav/clamd.conf';
const FRESHCLAM_CONFIG = '--config-file=/etc/clamav/freshclam.conf';
const SIGNATURE_REFRESH_TIMEOUT_MS = 120_000;

export async function refreshSignatures(): Promise<void> {
  const freshclam = spawn('freshclam', [FRESHCLAM_CONFIG, '--stdout'], {
    stdio: 'inherit',
    timeout: SIGNATURE_REFRESH_TIMEOUT_MS,
  });
  const [code, signal] = await once(freshclam, 'exit');
  if (code !== 0) log('warn', 'signature_refresh_failed', { code, signal });
}

export function startDaemons(onExit: () => void): ChildProcess[] {
  const daemons: Array<[string, string[]]> = [
    ['clamd', [CLAMD_CONFIG, '--foreground']],
    ['freshclam', [FRESHCLAM_CONFIG, '--daemon', '--foreground', '--stdout']],
  ];
  return daemons.map(([command, args]) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('exit', (code, signal) => {
      log('error', 'daemon_exited', { command, code, signal });
      onExit();
    });
    return child;
  });
}
