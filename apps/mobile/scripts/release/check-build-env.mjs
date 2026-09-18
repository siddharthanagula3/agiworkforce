#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = join(HERE, '..', '..');
const REPO_ROOT = join(MOBILE_ROOT, '..', '..');

// The toolchain a store build is allowed to use. EAS resolves "latest" and the
// "sdk-NN" aliases to whatever it ships today, which silently moves Xcode, the
// NDK and the JDK under a signed release.
export const PINNED_BUILD_ENV = Object.freeze({
  iosImage: 'macos-tahoe-26.5-xcode-26.6',
  androidImage: 'ubuntu-26.04-jdk-17-ndk-r27b-sdk-57',
  androidNdk: '27.1.12297006',
  cocoapods: '1.16.2',
});

const FLOATING_IMAGES = /^(?:latest|default|stable|sdk-\d+)$/u;

export function assertPinnedImages(easJson) {
  const failures = [];
  const base = easJson.build?.base ?? {};

  for (const [platform, expected] of [
    ['ios', PINNED_BUILD_ENV.iosImage],
    ['android', PINNED_BUILD_ENV.androidImage],
  ]) {
    const image = base[platform]?.image;
    if (typeof image !== 'string' || image.length === 0) {
      failures.push(`build.base.${platform}.image is not set, so EAS picks the runner`);
    } else if (FLOATING_IMAGES.test(image)) {
      failures.push(`build.base.${platform}.image is the floating "${image}", pin ${expected}`);
    } else if (image !== expected) {
      failures.push(`build.base.${platform}.image is ${image}, the reviewed image is ${expected}`);
    }
  }

  if (base.android?.ndk !== PINNED_BUILD_ENV.androidNdk) {
    failures.push(
      `build.base.android.ndk is ${base.android?.ndk}, the reviewed NDK is ${PINNED_BUILD_ENV.androidNdk}`,
    );
  }

  for (const [name, profile] of Object.entries(easJson.build ?? {})) {
    if (name === 'base') continue;
    if (profile.ios?.image !== undefined || profile.android?.image !== undefined) {
      failures.push(`profile ${name} overrides the pinned runner image`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`native build environment is not pinned:\n  - ${failures.join('\n  - ')}`);
  }
}

export function assertPinnedNodeToolchain(easJson, nvmrc, rootPackageJson) {
  const failures = [];
  const base = easJson.build?.base ?? {};
  const nodeMajor = nvmrc.trim().replace(/^v/u, '').split('.')[0];

  if (typeof base.node !== 'string' || !/^\d+\.\d+\.\d+$/u.test(base.node)) {
    failures.push(`build.base.node is ${JSON.stringify(base.node)}, pin an exact X.Y.Z version`);
  } else if (base.node.split('.')[0] !== nodeMajor) {
    failures.push(`build.base.node ${base.node} is not the repo's Node ${nodeMajor} (.nvmrc)`);
  }

  const packageManager = String(rootPackageJson.packageManager ?? '');
  const pnpmVersion = packageManager.startsWith('pnpm@')
    ? packageManager.slice('pnpm@'.length)
    : '';
  if (base.pnpm !== pnpmVersion) {
    failures.push(`build.base.pnpm is ${JSON.stringify(base.pnpm)}, the repo uses ${pnpmVersion}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `the build's JavaScript toolchain is not pinned:\n  - ${failures.join('\n  - ')}`,
    );
  }
}

export function assertPinnedCocoaPods(podfileLock) {
  if (podfileLock === null)
    return 'no generated iOS project in this checkout, CocoaPods state not verified';

  const match = podfileLock.match(/^COCOAPODS:\s*(\S+)\s*$/mu);
  if (!match) {
    throw new Error(
      'Podfile.lock carries no COCOAPODS version, so the resolver version is unknown',
    );
  }
  if (match[1] !== PINNED_BUILD_ENV.cocoapods) {
    throw new Error(
      `Podfile.lock was written by CocoaPods ${match[1]}, the reviewed version is ${PINNED_BUILD_ENV.cocoapods}`,
    );
  }
  return `CocoaPods ${match[1]} matches the pin`;
}

export function assertReproducibleNativeConfig(appConfig) {
  const policy = appConfig.runtimeVersion?.policy;
  if (policy !== 'fingerprint') {
    throw new Error(
      `runtimeVersion.policy is ${JSON.stringify(policy)}; only "fingerprint" ties an update to the native config it was built against`,
    );
  }
}

export async function checkBuildEnv({ log = console.log } = {}) {
  const easJson = JSON.parse(readFileSync(join(MOBILE_ROOT, 'eas.json'), 'utf8'));
  const nvmrc = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8');
  const rootPackageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

  assertPinnedImages(easJson);
  log(
    `[build-env] runner images pinned: ${PINNED_BUILD_ENV.iosImage}, ${PINNED_BUILD_ENV.androidImage}`,
  );

  assertPinnedNodeToolchain(easJson, nvmrc, rootPackageJson);
  log('[build-env] Node and pnpm match the repo');

  const podfileLockPath = join(MOBILE_ROOT, 'ios', 'Podfile.lock');
  log(
    `[build-env] ${assertPinnedCocoaPods(
      existsSync(podfileLockPath) ? readFileSync(podfileLockPath, 'utf8') : null,
    )}`,
  );

  process.env.APP_ENV ||= 'production';
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||= 'pk_live_build_env_check';
  const configModule = await import(pathToFileURL(join(MOBILE_ROOT, 'app.config.js')).href);
  assertReproducibleNativeConfig((configModule.default ?? configModule).expo);
  log(
    '[build-env] native config is fingerprint-derived, so a changed native tree changes the runtime version',
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  checkBuildEnv().catch((error) => {
    console.error(`[build-env] ERROR: ${error.message}`);
    process.exit(1);
  });
}
