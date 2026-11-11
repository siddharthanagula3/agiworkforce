import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';

import { PRODUCT_NAMES } from '@agiworkforce/types';
import { createNativeCloudFixture } from './native-cloud-fixture.mjs';

assert.equal(
  process.platform,
  'darwin',
  'This native UI fixture launcher currently supports macOS only',
);
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev', `${PRODUCT_NAMES.desktop}.app`);
const nativeExecutable = execFileSync(
  '/usr/bin/plutil',
  ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(bundle, 'Contents/Info.plist')],
  { encoding: 'utf8' },
).trim();
assert(nativeExecutable && path.basename(nativeExecutable) === nativeExecutable);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
const duration = Number(process.argv[2] ?? 1_800_000);
const windowSize = process.argv[3];
if (windowSize)
  assert(/^[1-9]\d*x[1-9]\d*$/.test(windowSize), 'Use WIDTHxHEIGHT for the native window size');
assert(
  Number.isSafeInteger(duration) && duration >= 1_000 && duration <= 3_600_000,
  'The fixture duration must be between one second and one hour',
);
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-native-cloud-'));
const config = path.join(artifacts, 'config');
fs.mkdirSync(config);
const fixture = createNativeCloudFixture();
const origin = await fixture.listen();
const stateFile = path.join(artifacts, 'fixture.json');
let child;
let stopped = false;
let stopping = false;
let lastExit = null;
const environment = Object.fromEntries(
  ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR']
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
Object.assign(environment, {
  AGIWORKFORCE_HOME: config,
  AGIWORKFORCE_API_BASE: origin,
  AGI_AUTH_BASE: `${origin}/api`,
  AGIWORKFORCE_JWT: fixture.jwt,
});

function writeState() {
  fs.writeFileSync(
    stateFile,
    JSON.stringify(
      {
        origin,
        jwt: fixture.jwt,
        owner: fixture.owner,
        config,
        artifacts,
        fixturePid: process.pid,
        nativePid: child?.pid ?? null,
        nativeRunning: !stopped,
        requestedWindowSize: windowSize ?? null,
        lastExit,
        expiresAt: new Date(started + duration).toISOString(),
      },
      null,
      2,
    ),
  );
}
function launch() {
  assert(!child || stopped, 'The previous native fixture process must exit before relaunch');
  const output = fs.openSync(path.join(artifacts, 'native.log'), 'a');
  child = spawn(
    path.join(bundle, 'Contents/MacOS', nativeExecutable),
    windowSize ? ['--window-size', windowSize] : [],
    {
      env: environment,
      stdio: ['ignore', output, output],
      detached: true,
    },
  );
  fs.closeSync(output);
  stopped = false;
  child.once('error', (error) => {
    lastExit = { error: error.message };
    stopped = true;
    writeState();
  });
  child.once('exit', (code, signal) => {
    lastExit = { code, signal };
    stopped = true;
    writeState();
    fs.writeFileSync(
      path.join(artifacts, 'ledger.json'),
      JSON.stringify(fixture.snapshot(), null, 2),
    );
  });
  writeState();
  console.log(JSON.stringify({ stateFile, origin, nativePid: child.pid }));
}
async function close() {
  if (stopping) return;
  stopping = true;
  clearTimeout(deadline);
  if (child && !stopped) {
    process.kill(-child.pid, 'SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  fs.writeFileSync(
    path.join(artifacts, 'ledger.json'),
    JSON.stringify(fixture.snapshot(), null, 2),
  );
  await fixture.close();
  fs.rmSync(config, { recursive: true, force: true });
  process.exitCode =
    fixture.snapshot().failures.length ||
    (lastExit && (lastExit.code !== 0 || lastExit.signal !== null))
      ? 1
      : 0;
  console.log(
    JSON.stringify({
      artifacts,
      failures: fixture.snapshot().failures.length,
      nativeExit: lastExit,
    }),
  );
  finish();
}
const started = Date.now();
let finish;
const finished = new Promise((resolve) => {
  finish = resolve;
});
const deadline = setTimeout(() => {
  void close();
}, duration);
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});
process.on('SIGUSR1', () => {
  if (stopping) return;
  if (!stopped) {
    console.error('The native fixture is still running; relaunch was refused');
    return;
  }
  launch();
});
launch();
await finished;
