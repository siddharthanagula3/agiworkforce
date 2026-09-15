#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { readChromeBuildConfiguration, validateReleaseManifest } from './manifest-config.mjs';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RELEASE_WEB_HOST = 'agiworkforce.com';

export function validateReleaseWebOrigin(raw) {
  const value = raw?.trim();
  if (!value) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'VITE_AGI_WEB_API_BASE_URL must be an absolute HTTPS origin for a production package.',
    );
  }
  const hostMatches =
    url.hostname === RELEASE_WEB_HOST || url.hostname.endsWith(`.${RELEASE_WEB_HOST}`);
  if (url.protocol !== 'https:' || !hostMatches) {
    throw new Error(
      `VITE_AGI_WEB_API_BASE_URL points at ${url.origin}; a production package must use an https://${RELEASE_WEB_HOST} origin.`,
    );
  }
}
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
validateReleaseWebOrigin(env.VITE_AGI_WEB_API_BASE_URL);

fs.rmSync(path.join(extensionRoot, 'extension.zip'), { force: true });

console.log(`Preparing clean Chrome Web Store package v${chromeManifest.version}.`);
