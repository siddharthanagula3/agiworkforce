#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  {
    label: 'packages/ui/ui (web + desktop)',
    path: 'packages/ui/ui/src/settings-modal/ConnectorLogo.tsx',
    marker: 'CONNECTOR_LOGO_URLS: Record',
  },
  {
    label: 'apps/mobile connectors screen',
    path: 'apps/mobile/src/features/settings/cloud-connectors/index.tsx',
    marker: 'LOGO_URLS: Record',
  },
];

function readLogoMap({ path, marker }) {
  const source = readFileSync(join(repoRoot, path), 'utf8');
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${path}: could not find "${marker}" — has the map been renamed or moved?`);
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
  if (entries.size === 0) throw new Error(`${path}: parsed zero entries — the format changed`);
  return entries;
}

const [reference, mirror] = SOURCES.map((source) => ({
  ...source,
  entries: readLogoMap(source),
}));

const shared = [...reference.entries.keys()].filter((key) => mirror.entries.has(key));
const drifted = shared.filter((key) => reference.entries.get(key) !== mirror.entries.get(key));

const HASHED_COMMONS = /upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\//;
const fragile = SOURCES.flatMap((source, index) => {
  const entries = index === 0 ? reference.entries : mirror.entries;
  return [...entries]
    .filter(([, url]) => HASHED_COMMONS.test(url))
    .map(([key]) => `${source.label}: ${key}`);
});

for (const entry of fragile) {
  console.warn(
    `warning: ${entry} uses a hashed Commons path. Wikimedia re-hashes these on rename;` +
      ` prefer https://commons.wikimedia.org/wiki/Special:FilePath/<File%20Name>.svg`,
  );
}

if (drifted.length === 0) {
  console.log(
    `Connector logo check passed: ${shared.length} shared keys agree across ${SOURCES.length} maps` +
      `${fragile.length > 0 ? ` (${fragile.length} fragile URLs warned)` : ''}.`,
  );
  process.exit(0);
}

for (const key of drifted) {
  console.error(`\nDRIFT  ${key}`);
  console.error(`  ${reference.label}\n    ${reference.entries.get(key)}`);
  console.error(`  ${mirror.label}\n    ${mirror.entries.get(key)}`);
}
console.error(
  `\ncheck:connector-logos FAILED — ${drifted.length} key(s) disagree between the two maps.` +
    ` Update both, or delete the duplicate if one surface no longer needs it.`,
);
process.exit(1);
