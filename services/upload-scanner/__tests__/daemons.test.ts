import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAMD_SOURCE_SCAN_SETTINGS } from '../src/config.ts';
import {
  CLAMD_CONFIG_FILE,
  refreshSignatures,
  startClamd,
  startFreshclam,
  writeSourceScanClamdConfig,
  type Daemon,
} from '../src/daemons.ts';

const originalPath = process.env['PATH'];
const running: Daemon[] = [];
let bin: string;

function stub(name: string, body: string): void {
  const file = join(bin, name);
  writeFileSync(file, `#!/bin/sh\necho ${name} >> "${join(bin, 'runs')}"\n${body}\n`);
  chmodSync(file, 0o755);
}

function runsOf(name: string): number {
  const log = join(bin, 'runs');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line === name).length;
}

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), 'upload-scanner-daemons-'));
  process.env['PATH'] = `${bin}:${originalPath}`;
});

afterEach(() => {
  for (const daemon of running.splice(0)) daemon.stop();
  process.env['PATH'] = originalPath;
  rmSync(bin, { recursive: true, force: true });
});

describe('daemon supervision', () => {
  it('keeps clamd scanning when freshclam exits, and starts freshclam again', async () => {
    stub('clamd', 'exec sleep 30');
    stub('freshclam', 'exit 17');
    const clamdExited = vi.fn();

    running.push(startClamd(clamdExited), startFreshclam(50));

    await vi.waitFor(() => expect(runsOf('freshclam')).toBeGreaterThanOrEqual(2), {
      timeout: 5000,
    });
    expect(clamdExited).not.toHaveBeenCalled();
  });

  it('stops the service when clamd exits', async () => {
    stub('clamd', 'exit 1');
    const clamdExited = vi.fn();

    running.push(startClamd(clamdExited));

    await vi.waitFor(() => expect(clamdExited).toHaveBeenCalledOnce(), { timeout: 5000 });
  });

  it('stops the service when clamd cannot be started at all', async () => {
    process.env['PATH'] = bin;
    const clamdExited = vi.fn();

    running.push(startClamd(clamdExited));

    await vi.waitFor(() => expect(clamdExited).toHaveBeenCalledOnce(), { timeout: 5000 });
  });

  it('does not treat a clamd it stopped itself as a failure', async () => {
    stub('clamd', 'exec sleep 30');
    const clamdExited = vi.fn();
    const clamd = startClamd(clamdExited);
    await vi.waitFor(() => expect(runsOf('clamd')).toBe(1), { timeout: 5000 });

    clamd.stop();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(clamdExited).not.toHaveBeenCalled();
  });

  it('starts with the signatures it has when the refresh cannot run', async () => {
    process.env['PATH'] = bin;

    await expect(refreshSignatures()).resolves.toBeUndefined();
  });
});

describe('clamd configuration file', () => {
  function clamdArguments(): string {
    const file = join(bin, 'clamd-args');
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  }

  it('starts clamd on the legacy configuration by default', async () => {
    stub('clamd', `echo "$@" > "${join(bin, 'clamd-args')}"\nexec sleep 30`);
    running.push(startClamd(vi.fn()));

    await vi.waitFor(() => expect(clamdArguments()).toContain('--foreground'), { timeout: 5000 });
    expect(clamdArguments()).toBe(`--config-file=${CLAMD_CONFIG_FILE} --foreground`);
  });

  it('starts clamd on the configuration it is given', async () => {
    stub('clamd', `echo "$@" > "${join(bin, 'clamd-args')}"\nexec sleep 30`);
    running.push(startClamd(vi.fn(), join(bin, 'source-scans.conf')));

    await vi.waitFor(() => expect(clamdArguments()).toContain('--foreground'), { timeout: 5000 });
    expect(clamdArguments()).toBe(`--config-file=${join(bin, 'source-scans.conf')} --foreground`);
  });

  it('writes the source scan configuration from the legacy file without changing it', () => {
    const base = join(bin, 'clamd.conf');
    const target = join(bin, 'generated', 'clamd.conf');
    writeFileSync(base, 'TCPSocket 3310\nTemporaryDirectory /dev/shm\nMaxScanSize 400M\n');

    expect(writeSourceScanClamdConfig(target, base)).toBe(target);

    const written = readFileSync(target, 'utf8');
    expect(written).toContain('TCPSocket 3310');
    expect(written).toContain(
      `TemporaryDirectory ${CLAMD_SOURCE_SCAN_SETTINGS['TemporaryDirectory']}`,
    );
    expect(written).toContain(`MaxScanSize ${CLAMD_SOURCE_SCAN_SETTINGS['MaxScanSize']}`);
    expect(written).not.toContain('/dev/shm');
    expect(readFileSync(base, 'utf8')).toContain('TemporaryDirectory /dev/shm');
    expect(statSync(target).mode & 0o077).toBe(0);
  });
});
