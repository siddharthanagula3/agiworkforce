#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI tool; stdout/log is the intended output channel */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

import {
  DEVICES,
  SCREENSHOTS,
  VERIFY_SCREENSHOT,
  type DeviceClass,
  type Platform,
  type Screenshot,
} from './catalog';

const {
  DETOX_IOS_UDID_ENV,
  DETOX_ANDROID_AVD_ENV,
  APP_BUNDLE_ID,
  IOS_APP_BINARY,
  ANDROID_APP_BINARY,
} = require('../../detox.env') as typeof import('../../detox.env');

const SIMCTL_RUNTIME_PREFIX = 'com.apple.CoreSimulator.SimRuntime.';
const ANDROID_BOOT_TIMEOUT_MS = 300_000;
const ANDROID_BOOT_POLL_MS = 3_000;
const ANDROID_BOOT_PROPERTY = 'sys.boot_completed';
const VERIFY_DIR = 'verify';

export type { DeviceClass, Platform };
export { DEVICES, SCREENSHOTS };

export interface SimctlDevice {
  udid: string;
  name: string;
  isAvailable?: boolean;
  state?: string;
  deviceTypeIdentifier?: string;
  dataPath?: string;
  dataPathSize?: number;
  logPath?: string;
  logPathSize?: number;
  lastBootedAt?: string;
}

export interface SimctlDeviceListing {
  devices: Record<string, SimctlDevice[]>;
}

type Variant = 'debug' | 'release';

const ROOT = resolve(__dirname, '..', '..');
const OUT = join(ROOT, 'store-listing', 'screenshots', 'captures');
const COMPOSITOR = join(ROOT, 'scripts', 'screenshots', 'compositor.ts');
const SPEC_DIR = join(ROOT, 'scripts', 'screenshots', 'specs');

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function ensureDetoxInstalled() {
  const probe = spawnSync('pnpm', ['exec', 'detox', '--version'], { cwd: ROOT, stdio: 'ignore' });
  if (probe.status !== 0) {
    throw new Error('Detox is not installed. Add detox@20 before running screenshot automation.');
  }
}

function appBinaryPath(platform: Platform, variant: Variant): string {
  const relative = platform === 'ios' ? IOS_APP_BINARY[variant] : ANDROID_APP_BINARY[variant];
  return join(ROOT, relative);
}

function ensureAppBuilt(platform: Platform, variant: Variant): string {
  const binary = appBinaryPath(platform, variant);
  if (existsSync(binary)) return binary;
  const buildCommand =
    platform === 'ios'
      ? `pnpm exec detox build --configuration ios.sim.${variant}`
      : `pnpm exec detox build --configuration android.emu.${variant}`;
  throw new Error(
    `No ${platform} ${variant} binary at ${binary}.\n` +
      `Build it first (from apps/mobile): ${buildCommand}`,
  );
}

function runtimeVersion(runtimeIdentifier: string): number[] {
  const tail = runtimeIdentifier.startsWith(SIMCTL_RUNTIME_PREFIX)
    ? runtimeIdentifier.slice(SIMCTL_RUNTIME_PREFIX.length)
    : runtimeIdentifier;
  return tail
    .split('-')
    .slice(1)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareRuntimeVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function resolveSimulatorUdid(listing: SimctlDeviceListing, simulatorName: string): string {
  const matches: { udid: string; runtime: string; version: number[] }[] = [];
  for (const [runtime, devices] of Object.entries(listing?.devices ?? {})) {
    for (const device of devices ?? []) {
      if (device?.name !== simulatorName || !device.udid) continue;
      if (device.isAvailable === false) continue;
      matches.push({ udid: device.udid, runtime, version: runtimeVersion(runtime) });
    }
  }
  if (matches.length === 0) {
    throw new Error(
      `No available simulator named "${simulatorName}". Create it in Xcode > Windows > Devices and Simulators, then re-run.`,
    );
  }
  matches.sort(
    (a, b) =>
      compareRuntimeVersions(a.version, b.version) ||
      b.runtime.localeCompare(a.runtime) ||
      a.udid.localeCompare(b.udid),
  );
  return matches[0].udid;
}

export function resolveAndroidAvd(available: readonly string[], avdName: string): string {
  if (available.includes(avdName)) return avdName;
  throw new Error(
    `No Android AVD named "${avdName}". Available: ${available.length ? available.join(', ') : '(none)'}. ` +
      'Create it in Android Studio > Device Manager, then re-run.',
  );
}

function listAvailableSimulators(): SimctlDeviceListing {
  let raw: string;
  try {
    raw = execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `Could not list simulators via "xcrun simctl": ${(error as Error).message}. ` +
        'Install Xcode and point xcode-select at it, then re-run.',
    );
  }
  try {
    return JSON.parse(raw) as SimctlDeviceListing;
  } catch {
    throw new Error(
      '"xcrun simctl list devices available --json" did not return JSON. ' +
        'Check that xcode-select points at a full Xcode install, then re-run.',
    );
  }
}

function listAvailableAvds(): string[] {
  let raw: string;
  try {
    raw = execFileSync('emulator', ['-list-avds'], { encoding: 'utf8' });
  } catch (error) {
    throw new Error(
      `Could not list Android AVDs via "emulator -list-avds": ${(error as Error).message}. ` +
        'Install the Android SDK emulator and put it on PATH, then re-run.',
    );
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(' '));
}

function waitForAndroidBoot() {
  execFileSync('adb', ['wait-for-device'], { stdio: 'inherit' });
  const deadline = Date.now() + ANDROID_BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const probe = spawnSync('adb', ['shell', 'getprop', ANDROID_BOOT_PROPERTY], {
      encoding: 'utf8',
    });
    if (probe.stdout?.trim() === '1') return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ANDROID_BOOT_POLL_MS);
  }
  throw new Error(
    `Emulator did not report ${ANDROID_BOOT_PROPERTY}=1 within ${ANDROID_BOOT_TIMEOUT_MS / 1000}s.`,
  );
}

function bootSimulator(device: DeviceClass): string | null {
  if (device.platform === 'ios') {
    const udid = resolveSimulatorUdid(listAvailableSimulators(), device.simulator);
    console.log(`  simulator ${device.simulator} -> ${udid}`);
    spawnSync('xcrun', ['simctl', 'boot', udid], { stdio: 'ignore' });
    execFileSync('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: 'inherit' });
    return udid;
  }
  const avd = resolveAndroidAvd(listAvailableAvds(), device.simulator);
  console.log(`  emulator avd ${avd}`);
  const emulator = spawn('emulator', ['-avd', avd, '-no-snapshot', '-no-audio'], {
    detached: true,
    stdio: 'ignore',
  });
  emulator.unref();
  waitForAndroidBoot();
  return null;
}

function installApp(device: DeviceClass, udid: string | null, variant: Variant) {
  const binary = ensureAppBuilt(device.platform, variant);
  console.log(`  installing ${basename(binary)}`);
  if (device.platform === 'ios') {
    execFileSync('xcrun', ['simctl', 'install', udid ?? 'booted', binary], { stdio: 'inherit' });
    return;
  }
  execFileSync('adb', ['install', '-r', '-t', binary], { stdio: 'inherit' });
}

function findCapturedPng(dir: string, expectedFileName: string): string | null {
  if (!existsSync(dir)) return null;
  const fallbacks: string[] = [];
  const walk = (current: string): string | null => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (entry === expectedFileName) {
        return full;
      } else if (entry.endsWith('.png')) {
        fallbacks.push(full);
      }
    }
    return null;
  };
  const exact = walk(dir);
  if (exact) return exact;
  if (fallbacks.length > 0) {
    throw new Error(
      `Detox produced no "${expectedFileName}" under ${dir}. It wrote: ${fallbacks
        .map((f) => basename(f))
        .join(', ')}. The spec's device.takeScreenshot() name must equal "<id>-<name>".`,
    );
  }
  return null;
}

function runDetoxSpec(
  device: DeviceClass,
  shot: Screenshot,
  rawOut: string,
  udid: string | null,
  variant: Variant,
) {
  const detoxConfig = device.platform === 'ios' ? `ios.sim.${variant}` : `android.emu.${variant}`;
  const specPath = join(SPEC_DIR, shot.spec);
  if (!existsSync(specPath)) {
    throw new Error(`Screenshot spec not found: ${specPath}`);
  }
  const artifactsDir = join(
    ROOT,
    'store-listing',
    'screenshots',
    '.detox-artifacts',
    device.className,
    shot.spec.replace(/\.spec\.ts$/, ''),
  );
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  const env = {
    ...process.env,
    DETOX_CAPTURE_PATH: rawOut,
    ...(udid ? { [DETOX_IOS_UDID_ENV]: udid } : {}),
    ...(device.platform === 'android' ? { [DETOX_ANDROID_AVD_ENV]: device.simulator } : {}),
  };
  execFileSync(
    'pnpm',
    [
      'exec',
      'detox',
      'test',
      '--configuration',
      detoxConfig,
      '--reuse',
      '--artifacts-location',
      `${artifactsDir}/`,
      specPath,
    ],
    { stdio: 'inherit', env, cwd: ROOT },
  );
  const producedPng = findCapturedPng(artifactsDir, basename(rawOut));
  if (!producedPng) {
    throw new Error(`Detox did not produce a screenshot under ${artifactsDir}`);
  }
  mkdirSync(resolve(rawOut, '..'), { recursive: true });
  copyFileSync(producedPng, rawOut);
  rmSync(artifactsDir, { recursive: true, force: true });
}

function composite(rawPath: string, finalPath: string, shot: Screenshot, device: DeviceClass) {
  execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      COMPOSITOR,
      '--raw',
      rawPath,
      '--out',
      finalPath,
      '--heading',
      shot.heading,
      '--subhead',
      shot.subhead,
      '--width',
      String(device.width),
      '--height',
      String(device.height),
    ],
    { stdio: 'inherit', cwd: ROOT },
  );
}

function captureForDevice(
  device: DeviceClass,
  shots: Screenshot[],
  variant: Variant,
  verifyOnly: boolean,
) {
  console.log(
    `\n=== ${device.platform}/${device.className} (${device.width}x${device.height}) ===`,
  );
  console.log(`  ${device.storeSlot ?? 'not an uploadable store size, internal use only'}`);
  ensureAppBuilt(device.platform, variant);
  const udid = bootSimulator(device);
  installApp(device, udid, variant);
  const classDir = join(OUT, device.platform, device.className);
  ensureDir(join(classDir, verifyOnly ? VERIFY_DIR : 'raw'));
  if (!verifyOnly) ensureDir(join(classDir, 'final'));

  for (const shot of shots) {
    const fileName = `${shot.id}-${shot.name}.png`;
    const rawOut = join(classDir, verifyOnly ? VERIFY_DIR : 'raw', fileName);
    console.log(`  -> ${fileName} (${shot.spec})`);
    runDetoxSpec(device, shot, rawOut, udid, variant);
    if (verifyOnly) {
      console.log(`  capture wiring OK: ${rawOut}`);
      continue;
    }
    composite(rawOut, join(classDir, 'final', fileName), shot, device);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const target = argv.find((a) => !a.startsWith('--')) ?? 'all';
  const variant: Variant = flags.has('--debug') ? 'debug' : 'release';
  const verifyOnly = flags.has('--verify');
  const shots = verifyOnly ? [VERIFY_SCREENSHOT] : SCREENSHOTS;

  ensureDetoxInstalled();
  ensureDir(OUT);
  const filter = (d: DeviceClass) =>
    target === 'all' || target === d.platform || target === d.className;
  const selected = DEVICES.filter(filter);
  if (selected.length === 0) {
    throw new Error(
      `No device class matches "${target}". Known: all, ios, android, ${DEVICES.map((d) => d.className).join(', ')}`,
    );
  }
  console.log(`configuration: ${variant}${verifyOnly ? ' (capture-wiring check only)' : ''}`);
  for (const d of selected) {
    captureForDevice(d, shots, variant, verifyOnly);
  }
  console.log('\nDone. Frames in apps/mobile/store-listing/screenshots/captures/');
  for (const d of selected.filter((device) => device.storeSlot)) {
    console.log(`  ${d.storeSlot}: ${d.platform}/${d.className}/final/`);
  }
}

if (require.main === module) {
  main();
}
