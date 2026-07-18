#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const requireFromMobile = createRequire(new URL('../package.json', import.meta.url));

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const mobilePackage = readJson(new URL('../package.json', import.meta.url));
const localLlmPackage = readJson(
  new URL('../../../packages/platform/local-llm/package.json', import.meta.url),
);
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

if (mobilePackage.dependencies?.react !== mobilePackage.devDependencies?.['react-test-renderer']) {
  throw new Error('react-test-renderer must use the same patch version as React');
}

const excluded = new Set(mobilePackage.expo?.install?.exclude ?? []);
for (const intentionalException of ['react', 'react-native']) {
  if (!excluded.has(intentionalException)) {
    throw new Error(
      `Expo dependency validation must document ${intentionalException} as an exception`,
    );
  }
}

const expoCheck = spawnSync('pnpm', ['exec', 'expo', 'install', '--check'], {
  cwd: mobileRoot,
  stdio: 'inherit',
});

if (expoCheck.error) throw expoCheck.error;
if (expoCheck.status !== 0) process.exit(expoCheck.status ?? 1);

console.log(
  `Expo dependencies are compatible; React Native ${declaredReactNative} matches the installed SDK manifest`,
);
