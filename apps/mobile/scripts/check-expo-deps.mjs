#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  classifyMismatches,
  parseCheckOutput,
  readReleaseAgePolicy,
} from './release/expo-deps-release-age.mjs';

const REGISTRY_TIMEOUT_MS = 30_000;

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const requireFromMobile = createRequire(new URL('../package.json', import.meta.url));

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const mobilePackage = readJson(new URL('../package.json', import.meta.url));
const localLlmPackage = readJson(
  new URL('../../../packages/platform/local-llm/package.json', import.meta.url),
);
const workspacePackage = readJson(new URL('../../../package.json', import.meta.url));
const expoBundledVersions = requireFromMobile('expo/bundledNativeModules.json');

const declaredReactNative = mobilePackage.dependencies?.['react-native'];
const bundledReactNative = expoBundledVersions['react-native'];
const localLlmReactNative = localLlmPackage.devDependencies?.['react-native'];

if (declaredReactNative !== bundledReactNative) {
  throw new Error(
    `Mobile react-native ${String(declaredReactNative)} does not match the installed Expo SDK manifest ${String(bundledReactNative)}`,
  );
}

if (localLlmReactNative !== declaredReactNative) {
  throw new Error(
    `@agiworkforce/local-llm react-native ${String(localLlmReactNative)} does not match mobile ${String(declaredReactNative)}`,
  );
}

const installedReactNative = realpathSync(requireFromMobile.resolve('react-native/package.json'));
const localLlmRequire = createRequire(
  new URL('../../../packages/platform/local-llm/package.json', import.meta.url),
);
const localLlmInstalledReactNative = realpathSync(
  localLlmRequire.resolve('react-native/package.json'),
);

if (installedReactNative !== localLlmInstalledReactNative) {
  throw new Error('Mobile and @agiworkforce/local-llm resolve different React Native runtimes');
}

const declaredReactTypes = mobilePackage.devDependencies?.['@types/react'];
const workspaceReactTypes = workspacePackage.pnpm?.overrides?.['@types/react'];
const installedReactTypes = requireFromMobile('@types/react/package.json').version;
if (declaredReactTypes !== workspaceReactTypes || installedReactTypes !== declaredReactTypes) {
  throw new Error('Mobile React types must match the workspace override and installed version');
}

if (mobilePackage.dependencies?.react !== mobilePackage.devDependencies?.['react-test-renderer']) {
  throw new Error('react-test-renderer must use the same patch version as React');
}

const excluded = new Set(mobilePackage.expo?.install?.exclude ?? []);
for (const intentionalException of ['react', 'react-native', '@types/react']) {
  if (!excluded.has(intentionalException)) {
    throw new Error(
      `Expo dependency validation must document ${intentionalException} as an exception`,
    );
  }
}

const expoCheck = spawnSync('pnpm', ['exec', 'expo', 'install', '--check', '--json'], {
  cwd: mobileRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

if (expoCheck.error) throw expoCheck.error;
const report = parseCheckOutput(expoCheck.stdout ?? '');
if (!report) {
  process.stderr.write(expoCheck.stdout ?? '');
  throw new Error('expo install --check returned no readable result');
}

async function readPublishDates(packageName) {
  const registry = (process.env.npm_config_registry ?? 'https://registry.npmjs.org').replace(
    /\/+$/,
    '',
  );
  try {
    const response = await fetch(`${registry}/${packageName.replaceAll('/', '%2F')}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const body = await response.json();
    return body && typeof body.time === 'object' ? body.time : undefined;
  } catch {
    return undefined;
  }
}

if (!report.upToDate) {
  // The workspace refuses a package younger than minimumReleaseAge, and Expo
  // publishes SDK patches about weekly. A patch the workspace cannot install
  // yet is held; everything it can install must already be installed.
  const policy = readReleaseAgePolicy(
    readFileSync(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8'),
  );
  const publishDates = await Promise.all(
    report.dependencies.map((dependency) => readPublishDates(dependency.packageName)),
  );
  const publishedAtByPackage = Object.fromEntries(
    report.dependencies.map((dependency, index) => [dependency.packageName, publishDates[index]]),
  );
  const { held, outdated } = classifyMismatches({
    dependencies: report.dependencies,
    publishedAtByPackage,
    policy,
    now: Date.now(),
  });

  if (outdated.length > 0) {
    for (const entry of outdated) {
      console.error(
        `${entry.packageName}@${entry.actualVersion} - expected version: ${entry.expectedVersionOrRange} (${entry.reason})`,
      );
    }
    console.error('Found outdated dependencies');
    process.exit(1);
  }

  for (const entry of held) {
    console.log(
      `${entry.packageName}@${entry.actualVersion} is the newest patch the release-age rule allows; ${entry.expectedVersionOrRange} can be installed from ${entry.unlocksAt}`,
    );
  }
}

console.log(
  `Expo dependencies are compatible; React Native ${declaredReactNative} matches the installed SDK manifest`,
);
