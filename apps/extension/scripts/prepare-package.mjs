#!/usr/bin/env node

import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import {
  FIRST_DRAFT_ARCHIVE_SUFFIX,
  readChromeBuildConfiguration,
  validateReleaseManifest,
} from './manifest-config.mjs';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const firstDraft = process.argv.slice(2).includes('--first-draft');
const archiveName = firstDraft ? `extension${FIRST_DRAFT_ARCHIVE_SUFFIX}` : 'extension.zip';

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
validateReleaseManifest(chromeManifest, buildConfiguration, { firstDraft });
validateReleaseWebOrigin(env.VITE_AGI_WEB_API_BASE_URL);

fs.rmSync(path.join(extensionRoot, 'extension.zip'), { force: true });
fs.rmSync(path.join(extensionRoot, `extension${FIRST_DRAFT_ARCHIVE_SUFFIX}`), { force: true });

console.log(
  firstDraft
    ? `Preparing first-draft ${archiveName} v${chromeManifest.version}: upload it once in the Developer Dashboard to create the item, and never submit it for review.`
    : `Preparing clean Chrome Web Store package v${chromeManifest.version}.`,
);
