#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI tool; stdout/log is the intended output channel */
/**
 * AGI screenshot pipeline.
 *
 * Iterates the device matrix in
 * apps/mobile/store-listing/screenshots/specs/README.md, runs the
 * Detox spec for each screenshot, captures the raw frame, and
 * composites the locked tagline overlay.
 *
 * Usage:
 *   pnpm screenshots:ios       — iOS simulator captures (4 classes × 6 = 24)
 *   pnpm screenshots:android   — Android emulator captures (1 class × 6 = 6)
 *   pnpm screenshots:composite — re-composite existing raw frames only
 *
 * Outputs:
 *   apps/mobile/store-listing/screenshots/captures/{class}/raw/NN-name.png
 *   apps/mobile/store-listing/screenshots/captures/{class}/final/NN-name.png
 */

import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Platform = 'ios' | 'android';

interface DeviceClass {
  platform: Platform;
  className: string;
  simulator: string;
  width: number;
  height: number;
}

const DEVICES: DeviceClass[] = [
  // Local demo QA matrix. Keep this aligned with installed simulators.
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
  // Android requires the local AVD to exist before running screenshots:android.
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

/**
 * Current demo screenshot slots. These map to real specs in
 * scripts/screenshots/specs and are used for local visual QA. Store-release
 * multi-device captures require a separate installed device matrix.
 */
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
    id: '05',
    name: 'image-question',
    spec: '05-image-with-question.spec.ts',
    heading: 'Ask about images',
    subhead: 'Attach a photo and keep the workflow in chat.',
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

function bootSimulator(device: DeviceClass) {
  if (device.platform === 'ios') {
    execSync(`xcrun simctl boot "${device.simulator}" 2>/dev/null || true`);
    execSync(`xcrun simctl bootstatus "${device.simulator}" -b`);
  } else {
    execSync(`emulator -avd ${device.simulator} -no-snapshot -no-audio &`, { stdio: 'ignore' });
    execSync('adb wait-for-device');
  }
}

/**
 * Resolve the Detox spec file for a given screenshot slot and device.
 */
function resolveSpec(s: Screenshot, d: DeviceClass): string {
  void d;
  return s.spec;
}

/**
 * Recursively find the first .png Detox wrote under an artifacts run dir.
 * Detox nests screenshots under a per-test directory it names itself
 * (e.g. "✓ describe name/artifactName.png"), so the exact path can't be
 * predicted up front — only the run-level root we pass via
 * --artifacts-location.
 */
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

function runDetoxSpec(device: DeviceClass, spec: string, rawOut: string) {
  const detoxConfig = device.platform === 'ios' ? 'ios.sim.debug' : 'android.emu.debug';
  const specPath = join(ROOT, 'scripts', 'screenshots', 'specs', spec);
  if (!existsSync(specPath)) {
    throw new Error(`Screenshot spec not found: ${specPath}`);
  }
  // Detox's own artifact naming is per-test and unpredictable, so we point
  // --artifacts-location at a throwaway dir (trailing slash pins the exact
  // path — no timestamp suffix) and copy the one PNG it produces to the
  // path pipeline.ts's caller expects.
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
  const env = { ...process.env, DETOX_CAPTURE_PATH: rawOut };
  execSync(
    `pnpm exec detox test --configuration ${detoxConfig} --reuse --artifacts-location "${artifactsDir}/" ` +
      `apps/mobile/scripts/screenshots/specs/${spec}`,
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
  // Compositor is a separate module — see compositor.ts — which uses
  // sharp + node-canvas to render the locked teal gradient overlay
  // and Inter-700 headings per the design tokens table in
  // store-listing/screenshots/specs/README.md.
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
  bootSimulator(device);
  const classDir = join(OUT, device.platform, device.className);
  ensureDir(join(classDir, 'raw'));
  ensureDir(join(classDir, 'final'));

  for (const s of SCREENSHOTS) {
    const rawOut = join(classDir, 'raw', `${s.id}-${s.name}.png`);
    const finalOut = join(classDir, 'final', `${s.id}-${s.name}.png`);
    const spec = resolveSpec(s, device);
    console.log(`  -> ${s.id}-${s.name} (${spec})`);
    runDetoxSpec(device, spec, rawOut);
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

main();
