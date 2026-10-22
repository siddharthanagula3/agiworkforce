#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const REFERENCE = {
  label: 'packages/ui/ui (web + desktop)',
  path: 'packages/ui/ui/src/settings-modal/ConnectorLogo.tsx',
  marker: 'CONNECTOR_LOGO_URLS: Record',
};

// The store builds draw a generic icon beside the connector name and fetch no
// third-party logo (App Review 5.2.1), so the mobile component carries no URL.
const MOBILE_LOGO_PATH = 'apps/mobile/src/features/settings/cloud-connectors/ConnectorLogo.tsx';
const REMOTE_URL = /https?:\/\//;

function readLogoMap({ path, marker }) {
  const source = readFileSync(join(repoRoot, path), 'utf8');
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${path}: could not find "${marker}", has the map been renamed or moved?`);
  }

  const rest = source.slice(markerIndex);
  const open = rest.indexOf('{');
  let depth = 0;
  let close = -1;
  for (let i = open; i < rest.length; i += 1) {
    if (rest[i] === '{') depth += 1;
    else if (rest[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`${path}: unterminated object literal after "${marker}"`);

  const body = rest.slice(open, close + 1);
  const entries = new Map();
  for (const match of body.matchAll(/([A-Za-z0-9_.\-]+)\s*:\s*(?:\n\s*)?'([^']+)'/g)) {
    entries.set(match[1].toLowerCase(), match[2]);
  }
  if (entries.size === 0) throw new Error(`${path}: parsed zero entries, the format changed`);
  return entries;
}

const reference = { ...REFERENCE, entries: readLogoMap(REFERENCE) };

const HASHED_COMMONS = /upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\//;
const fragile = [...reference.entries]
  .filter(([, url]) => HASHED_COMMONS.test(url))
  .map(([key]) => `${reference.label}: ${key}`);

for (const entry of fragile) {
  console.warn(
    `warning: ${entry} uses a hashed Commons path. Wikimedia re-hashes these on rename;` +
      ` prefer https://commons.wikimedia.org/wiki/Special:FilePath/<File%20Name>.svg`,
  );
}

const mobileSource = readFileSync(join(repoRoot, MOBILE_LOGO_PATH), 'utf8');
if (REMOTE_URL.test(mobileSource)) {
  console.error(
    `check:connector-logos FAILED, ${MOBILE_LOGO_PATH} references a remote URL. The mobile app` +
      ' shows a generic icon and the connector name, never a fetched third-party logo.',
  );
  process.exit(1);
}

console.log(
  `Connector logo check passed: ${reference.entries.size} web logos parsed, mobile fetches none` +
    `${fragile.length > 0 ? ` (${fragile.length} fragile URLs warned)` : ''}.`,
);
