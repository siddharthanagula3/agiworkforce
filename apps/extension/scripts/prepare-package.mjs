#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import {
  readChromeBuildConfiguration,
  validateReleaseManifest,
} from './manifest-config.mjs';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'),
);
const chromeManifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'dist', 'manifest.json'), 'utf8'),
);
const env = { ...loadEnv('production', extensionRoot, ''), ...process.env };
const buildConfiguration = readChromeBuildConfiguration(env);

if (packageManifest.version !== chromeManifest.version) {
  throw new Error(
    `Chrome release version mismatch: package.json=${packageManifest.version} manifest.json=${chromeManifest.version}`,
  );
}
if (chromeManifest.manifest_version !== 3) {
  throw new Error(
    `Chrome Web Store releases require Manifest V3; got ${chromeManifest.manifest_version}`,
  );
}
validateReleaseManifest(chromeManifest, buildConfiguration);

fs.rmSync(path.join(extensionRoot, 'extension.zip'), { force: true });

console.log(`Preparing clean Chrome Web Store package v${chromeManifest.version}.`);
