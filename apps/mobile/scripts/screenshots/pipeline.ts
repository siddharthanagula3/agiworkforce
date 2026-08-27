#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI tool; stdout/log is the intended output channel */

import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Platform = 'ios' | 'android';

const SIMCTL_RUNTIME_PREFIX = 'com.apple.CoreSimulator.SimRuntime.';
const DETOX_IOS_UDID_ENV = 'DETOX_IOS_UDID';

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

export interface DeviceClass {
  platform: Platform;
  className: string;
  simulator: string;
  width: number;
  height: number;
}

export const DEVICES: DeviceClass[] = [
  {
    platform: 'ios',
    className: 'iphone-17-pro',
    simulator: 'iPhone 17 Pro',
    width: 1206,
    height: 2622,
  },
  {
    platform: 'ios',
    className: 'iphone-17-pro-max',
    simulator: 'iPhone 17 Pro Max',
    width: 1320,
    height: 2868,
  },
  {
    platform: 'ios',
    className: 'ipad-pro-13',
    simulator: 'iPad Pro 13-inch (M5)',
    width: 2048,
    height: 2732,
  },
  {
    platform: 'ios',
    className: 'ipad-pro-11',
    simulator: 'iPad Pro 11-inch (M5)',
    width: 1668,
    height: 2388,
  },
  {
    platform: 'android',
    className: 'phone',
    simulator: 'pixel_8_api_34',
    width: 1080,
    height: 2400,
  },
];

interface Screenshot {
  id: string;
  name: string;
  spec: string;
  heading: string;
  subhead: string;
}

const SCREENSHOTS: Screenshot[] = [
  {
    id: '01',
    name: 'local-demo-chat',
    spec: '01-multi-provider.spec.ts',
    heading: 'Local chat first',
    subhead: 'Start privately, then sign in to unlock cloud.',
  },
  {
    id: '02',
    name: 'onboarding-local',
    spec: '02-onboarding-local.spec.ts',
    heading: 'Start without an account',
    subhead: 'Local setup, device fit, and model readiness.',
  },
  {
    id: '03',
    name: 'first-message',
    spec: '03-chat-first-message.spec.ts',
    heading: 'Chat with local models',
    subhead: 'Composer, model badge, and performance feedback.',
  },
  {
    id: '04',
    name: 'cloud-sign-in',
    spec: '04-mode-toggle-to-sign-in.spec.ts',
    heading: 'Sign in for Cloud',
    subhead: 'Cloud chat opens to any signed-in account.',
  },
  {
    id: '06',
    name: 'voice-recording',
    spec: '06-voice-record-and-send.spec.ts',
    heading: 'Hold to speak',
    subhead: 'Voice input feeds the same local chat workflow.',
  },
];

const ROOT = resolve(__dirname, '..', '..');
const OUT = join(ROOT, 'store-listing', 'screenshots', 'captures');

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function ensureDetoxInstalled() {
  try {
    execSync('pnpm exec detox --version', { stdio: 'ignore' });
  } catch {
    throw new Error('Detox is not installed. Add detox@20 before running screenshot automation.');
  }
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

function bootSimulator(device: DeviceClass): string | null {
  if (device.platform === 'ios') {
    const udid = resolveSimulatorUdid(listAvailableSimulators(), device.simulator);
    console.log(`  simulator ${device.simulator} -> ${udid}`);
    spawnSync('xcrun', ['simctl', 'boot', udid], { stdio: 'ignore' });
    execFileSync('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: 'inherit' });
    return udid;
  }
  execSync(`emulator -avd ${device.simulator} -no-snapshot -no-audio &`, { stdio: 'ignore' });
  execSync('adb wait-for-device');
  return null;
}

function resolveSpec(s: Screenshot, d: DeviceClass): string {
  void d;
  return s.spec;
}

function findScreenshotPng(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const found = findScreenshotPng(full);
      if (found) return found;
    } else if (entry.endsWith('.png')) {
      return full;
    }
  }
  return null;
}

function runDetoxSpec(device: DeviceClass, spec: string, rawOut: string, udid: string | null) {
  const detoxConfig = device.platform === 'ios' ? 'ios.sim.debug' : 'android.emu.debug';
  const specPath = join(ROOT, 'scripts', 'screenshots', 'specs', spec);
  if (!existsSync(specPath)) {
    throw new Error(`Screenshot spec not found: ${specPath}`);
  }
  const artifactsDir = join(
    ROOT,
    'store-listing',
    'screenshots',
    '.detox-artifacts',
    device.className,
    spec.replace(/\.spec\.ts$/, ''),
  );
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  const env = {
    ...process.env,
    DETOX_CAPTURE_PATH: rawOut,
    ...(udid ? { [DETOX_IOS_UDID_ENV]: udid } : {}),
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
      `apps/mobile/scripts/screenshots/specs/${spec}`,
    ],
    { stdio: 'inherit', env },
  );
  const producedPng = findScreenshotPng(artifactsDir);
  if (!producedPng) {
    throw new Error(`Detox did not produce a screenshot under ${artifactsDir}`);
  }
  mkdirSync(resolve(rawOut, '..'), { recursive: true });
  copyFileSync(producedPng, rawOut);
  rmSync(artifactsDir, { recursive: true, force: true });
}

function composite(rawPath: string, finalPath: string, s: Screenshot, device: DeviceClass) {
  execSync(
    `pnpm tsx apps/mobile/scripts/screenshots/compositor.ts ` +
      `--raw "${rawPath}" --out "${finalPath}" ` +
      `--heading "${s.heading}" --subhead "${s.subhead}" ` +
      `--width ${device.width} --height ${device.height}`,
    { stdio: 'inherit' },
  );
}

function captureForDevice(device: DeviceClass) {
  console.log(`\n=== ${device.platform}/${device.className} ===`);
  const udid = bootSimulator(device);
  const classDir = join(OUT, device.platform, device.className);
  ensureDir(join(classDir, 'raw'));
  ensureDir(join(classDir, 'final'));

  for (const s of SCREENSHOTS) {
    const rawOut = join(classDir, 'raw', `${s.id}-${s.name}.png`);
    const finalOut = join(classDir, 'final', `${s.id}-${s.name}.png`);
    const spec = resolveSpec(s, device);
    console.log(`  -> ${s.id}-${s.name} (${spec})`);
    runDetoxSpec(device, spec, rawOut, udid);
    composite(rawOut, finalOut, s, device);
  }
}

function main() {
  const target = process.argv[2] ?? 'all';
  ensureDetoxInstalled();
  ensureDir(OUT);
  const filter = (d: DeviceClass) =>
    target === 'all' || target === d.platform || target === d.className;
  for (const d of DEVICES.filter(filter)) {
    captureForDevice(d);
  }
  console.log('\nDone. Frames in apps/mobile/store-listing/screenshots/captures/');
}

if (require.main === module) {
  main();
}
