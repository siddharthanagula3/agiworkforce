#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const WDIO_IDENTIFIER = 'com.agiworkforce.desktop.wdio';
const PROBE_PORT = 45999;
const PROBE_WINDOW_MS = 15_000;

const [, , binaryArg, ...flags] = process.argv;
if (!binaryArg) {
  console.error('usage: node wdio/check-release-binary.mjs <release-binary> [--probe]');
  process.exit(2);
}
const binary = resolve(binaryArg);
if (!existsSync(binary)) {
  console.error(`release check: binary not found at ${binary}`);
  process.exit(2);
}

let failed = false;

const grep = spawnSync('grep', ['-aq', WDIO_IDENTIFIER, binary]);
if (grep.status === 0) {
  console.error(
    `FAIL: ${binary} embeds the isolated test identifier ${WDIO_IDENTIFIER}. ` +
      'This is a WDIO harness artifact, not a release build.',
  );
  failed = true;
} else {
  console.log(`ok: no ${WDIO_IDENTIFIER} identifier embedded`);
}

if (flags.includes('--probe')) {
  const child = spawn(binary, [], {
    env: { ...process.env, TAURI_WEBDRIVER_PORT: String(PROBE_PORT) },
    stdio: 'ignore',
    detached: true,
  });
  const portOpened = await new Promise((resolvePromise) => {
    const deadline = Date.now() + PROBE_WINDOW_MS;
    const tryConnect = () => {
      if (Date.now() > deadline) return resolvePromise(false);
      const socket = connect({ port: PROBE_PORT, host: '127.0.0.1' }, () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.on('error', () => {
        socket.destroy();
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already exited.
    }
  }
  if (portOpened) {
    console.error(
      `FAIL: the binary opened WebDriver port ${PROBE_PORT}, the wdio plugin registered in ` +
        'what should be a release (non-debug_assertions) build.',
    );
    failed = true;
  } else {
    console.log(`ok: WebDriver port ${PROBE_PORT} never opened during ${PROBE_WINDOW_MS}ms probe`);
  }
}

process.exit(failed ? 1 : 0);
