#!/usr/bin/env tsx
/**
 * AGI screenshot pipeline.
 *
 * Iterates the device matrix in
 * apps/mobile/store-listing/screenshots/specs/README.md, runs the
 * Detox spec for each screenshot, captures the raw frame, and
 * composites the locked tagline overlay.
 *
 * Usage:
 *   pnpm screenshots:ios       — iOS simulator captures (5 classes × 6 = 30)
 *   pnpm screenshots:android   — Android emulator captures (3 classes × 6 = 18)
 *   pnpm screenshots:composite — re-composite existing raw frames only
 *
 * Outputs:
 *   apps/mobile/store-listing/screenshots/captures/{class}/raw/NN-name.png
 *   apps/mobile/store-listing/screenshots/captures/{class}/final/NN-name.png
 */

import { execSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
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
  // iOS — order matches App Store Connect required classes
  { platform: 'ios', className: '6.7', simulator: 'iPhone 17 Pro Max', width: 1290, height: 2796 },
  { platform: 'ios', className: '6.5', simulator: 'iPhone 11 Pro Max', width: 1242, height: 2688 },
  { platform: 'ios', className: '5.5', simulator: 'iPhone 8 Plus', width: 1242, height: 2208 },
  {
    platform: 'ios',
    className: '12.9',
    simulator: 'iPad Pro (12.9-inch) (6th generation)',
    width: 2048,
    height: 2732,
  },
  {
    platform: 'ios',
    className: '11',
    simulator: 'iPad Pro (11-inch) (4th generation)',
    width: 1668,
    height: 2388,
  },
  // Android — phone + 2 tablets
  {
    platform: 'android',
    className: 'phone',
    simulator: 'pixel_8_pro_api_34',
    width: 1080,
    height: 2400,
  },
  {
    platform: 'android',
    className: 'tablet-10',
    simulator: 'pixel_tablet_api_34',
    width: 1920,
    height: 1200,
  },
  {
    platform: 'android',
    className: 'tablet-7',
    simulator: 'pixel_7_api_34_landscape',
    width: 1280,
    height: 800,
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
    name: 'multi-provider',
    spec: '01-multi-provider.spec.ts',
    heading: 'One conversation. Every model.',
    subhead: 'Switch between Claude, GPT, Gemini, and 9 more — mid-thread.',
  },
  {
    id: '02',
    name: 'byok-keys',
    spec: '02-byok-keys.spec.ts',
    heading: 'Your keys. Your billing.',
    subhead: 'Paste once. We never see them. Pay providers direct.',
  },
  {
    id: '03',
    name: 'cross-provider-continuity',
    spec: '03-cross-provider.spec.ts',
    heading: 'Continue with Llama. Or Claude. Or both.',
    subhead: 'Tool calls, attachments, and context migrate automatically.',
  },
  {
    id: '04',
    name: 'voice-hold-to-speak',
    spec: '04-voice.spec.ts',
    heading: 'Hold to speak.',
    subhead: 'On-device transcription. No audio leaves your phone.',
  },
  {
    id: '05',
    name: 'vision-attachment',
    spec: '05-vision.spec.ts',
    heading: 'Vision in any provider.',
    subhead: 'Attach an image. Get an answer from Claude, GPT, or Gemini.',
  },
  {
    id: '06',
    name: 'cross-device-sync',
    spec: '06-sync.spec.ts',
    heading: 'Start here. Finish anywhere.',
    subhead: 'Phone, laptop, tablet, web. One thread, all devices.',
  },
];

const ROOT = resolve(__dirname, '..', '..');
const OUT = join(ROOT, 'store-listing', 'screenshots', 'captures');

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
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

function runDetoxSpec(device: DeviceClass, spec: string, rawOut: string) {
  const detoxConfig = device.platform === 'ios' ? 'ios.sim.release' : 'android.emu.release';
  const env = { ...process.env, DETOX_CAPTURE_PATH: rawOut };
  execSync(
    `pnpm detox test --configuration ${detoxConfig} apps/mobile/scripts/screenshots/specs/${spec}`,
    { stdio: 'inherit', env },
  );
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
    console.log(`  -> ${s.id}-${s.name}`);
    runDetoxSpec(device, s.spec, rawOut);
    composite(rawOut, finalOut, s, device);
  }
}

function main() {
  const target = process.argv[2] ?? 'all';
  ensureDir(OUT);
  const filter = (d: DeviceClass) =>
    target === 'all' || target === d.platform || target === d.className;
  for (const d of DEVICES.filter(filter)) {
    captureForDevice(d);
  }
  console.log('\nDone. Frames in apps/mobile/store-listing/screenshots/captures/');
}

main();
