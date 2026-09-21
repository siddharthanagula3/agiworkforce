#!/usr/bin/env node

/**
 * One maturity vocabulary, one channel vocabulary, and a governed entry for
 * every feature that is not finished.
 *
 * The vocabularies are read from their source of truth and every table that
 * keys on one is required to carry all of its members, so a stage nobody can
 * label or deny on cannot be added. Each feature below general availability is
 * then required to name an owner that exists in this repository, a switch in
 * the kill-switch vocabulary, a rollout ring, what would end its unfinished
 * state, what happens to the rows it wrote, and what a reporter is owed.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { readVocabulary } from './check-feature-registry.mjs';

export const REGISTRY_PATH = 'packages/contracts/types/src/feature-registry.json';
export const REGISTRY_MODULE = 'packages/contracts/types/src/feature-registry.ts';
export const CATALOG = 'packages/contracts/types/src/model-catalog.ts';
export const CAPABILITIES = 'packages/contracts/types/src/capabilities.ts';
export const FLAG_DEFINITION = 'apps/web/lib/feature-flags/flag-definition.ts';
export const KILL_SWITCHES = 'apps/web/lib/feature-flags/kill-switches.ts';
export const RING_CHANNELS = 'apps/web/lib/feature-flags/rollout-rings.ts';
export const PIPELINE_CHANNELS = 'scripts/lib/rollout/channels.mjs';

export const GENERALLY_AVAILABLE = 'general_availability';

/** Every table anywhere that is keyed by maturity, and so must be total over it. */
const MATURITY_TABLES = [
  { file: REGISTRY_MODULE, symbol: 'FEATURE_MATURITY_LABELS', role: 'what a user is shown' },
  { file: FLAG_DEFINITION, symbol: 'MATURITY_DENIAL_REASONS', role: 'why a refusal happened' },
];

/** Every list of release channels. They are one vocabulary or they are not one. */
const CHANNEL_LISTS = [
  { file: RING_CHANNELS, symbol: 'RELEASE_CHANNELS', role: 'rollout rings' },
  { file: PIPELINE_CHANNELS, symbol: 'RELEASE_CHANNELS', role: 'the release pipeline' },
];

const PROSE_FIELDS = ['exitCriteria', 'dataMigration', 'support'];
const SHORTEST_ANSWER = 40;
const RING_ID = /^[a-z][a-z0-9_]*$/;

function read(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}

/** The keys of an exported record literal, which is what "total over" means here. */
export function readRecordKeys(source, symbol) {
  const start = source.indexOf(`export const ${symbol}`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  let end = -1;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end === -1) return null;
  const body = source.slice(open + 1, end);
  const keys = [];
  let nesting = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (nesting === 0) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(trimmed);
      if (match) keys.push(match[1]);
    }
    nesting += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length;
  }
  return keys.length === 0 ? null : keys;
}

export function killSwitchVocabulary(repoRoot) {
  const capabilities = read(repoRoot, CAPABILITIES);
  const extras = read(repoRoot, KILL_SWITCHES);
  const platform =
    capabilities === null ? null : readVocabulary(capabilities, 'PlatformCapability');
  const extra = extras === null ? null : readVocabulary(extras, 'EXTRA_KILL_SWITCH_CAPABILITIES');
  if (platform === null || extra === null) return null;
  return [...platform, ...extra];
}

function checkVocabularies(repoRoot, errors) {
  const catalog = read(repoRoot, CATALOG);
  if (catalog === null) {
    errors.push(
      `${CATALOG}: the maturity and channel vocabulary is gone; nothing resolves either.`,
    );
    return null;
  }
  const maturities = readVocabulary(catalog, 'FEATURE_MATURITIES');
  const channels = readVocabulary(catalog, 'RELEASE_CHANNELS');
  if (maturities === null || channels === null) {
    errors.push(
      `${CATALOG}: FEATURE_MATURITIES and RELEASE_CHANNELS must both be exported here; they are ` +
        'the vocabulary every surface reads.',
    );
    return null;
  }
  if (!maturities.includes(GENERALLY_AVAILABLE)) {
    errors.push(
      `${CATALOG}: the maturity vocabulary has no "${GENERALLY_AVAILABLE}" stage, so a finished ` +
        'feature has no name and is only ever implied.',
    );
  }

  for (const table of MATURITY_TABLES) {
    const source = read(repoRoot, table.file);
    const keys = source === null ? null : readRecordKeys(source, table.symbol);
    if (keys === null) {
      errors.push(
        `${table.file}: ${table.symbol} is the table for ${table.role} and could not be read, so ` +
          'no maturity stage can be checked against it.',
      );
      continue;
    }
    for (const maturity of maturities) {
      if (keys.includes(maturity)) continue;
      errors.push(
        `${table.file}: ${table.symbol} has no entry for the "${maturity}" maturity, so a feature ` +
          `at that stage has no answer for ${table.role}.`,
      );
    }
    for (const key of keys) {
      if (maturities.includes(key)) continue;
      errors.push(
        `${table.file}: ${table.symbol} carries "${key}", which ${CATALOG} does not name as a ` +
          'maturity. A stage exists here or it does not exist.',
      );
    }
  }

  for (const list of CHANNEL_LISTS) {
    const source = read(repoRoot, list.file);
    const members = source === null ? null : readVocabulary(source, list.symbol);
    if (members === null) {
      errors.push(
        `${list.file}: ${list.symbol} could not be read, so ${list.role} may be using a different ` +
          'set of channel names from the rest of the product.',
      );
      continue;
    }
    if (members.join(',') === channels.join(',')) continue;
    errors.push(
      `${list.file}: ${list.role} names the channels ${members.join(', ')} where ${CATALOG} names ` +
        `${channels.join(', ')}. Two channel vocabularies cannot be reconciled during an incident.`,
    );
  }

  return maturities;
}

function checkGovernance({ repoRoot, id, definition, maturities, switches, rings, errors }) {
  const maturity = definition.maturity;
  if (typeof maturity !== 'string' || !maturities.includes(maturity)) {
    errors.push(`${REGISTRY_PATH}: "${id}" declares maturity "${maturity}", which is not a stage.`);
    return;
  }
  const governance = definition.governance;
  if (maturity === GENERALLY_AVAILABLE) {
    if (governance !== undefined) {
      errors.push(
        `${REGISTRY_PATH}: "${id}" is generally available and still carries a governance block. ` +
          'Exit criteria for a feature that has already exited is a record nobody maintains.',
      );
    }
    return;
  }
  if (governance === undefined || governance === null) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" is ${maturity} and names no owner, no exit criteria, no switch ` +
        'and no support expectation. It cannot be handed to anyone in that state.',
    );
    return;
  }

  if (typeof governance.owner !== 'string' || !existsSync(path.join(repoRoot, governance.owner))) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" is owned by ${JSON.stringify(governance.owner)}, which is not a ` +
        'path in this repository, so the owner outlived the code.',
    );
  }
  if (!switches.includes(governance.killSwitch)) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" says it is taken back with ${JSON.stringify(governance.killSwitch)}, ` +
        'which is not a switch an operator can flip. That is a rollback plan nobody can run.',
    );
  }
  if (typeof governance.rolloutRing !== 'string' || !RING_ID.test(governance.rolloutRing)) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" names the rollout ring ${JSON.stringify(governance.rolloutRing)}, ` +
        'which is not a ring id, so it cannot be widened or held.',
    );
  } else if (rings.has(governance.rolloutRing)) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" and "${rings.get(governance.rolloutRing)}" share the rollout ring ` +
        `"${governance.rolloutRing}", so holding one would hold the other.`,
    );
  } else {
    rings.set(governance.rolloutRing, id);
  }
  for (const field of PROSE_FIELDS) {
    const value = governance[field];
    if (typeof value === 'string' && value.trim().length >= SHORTEST_ANSWER) continue;
    errors.push(
      `${REGISTRY_PATH}: "${id}" gives no usable ${field}. A ${maturity} feature is asked this ` +
        'during an incident and a blank is not an answer.',
    );
  }
  if (typeof governance.userFacing !== 'boolean') {
    errors.push(
      `${REGISTRY_PATH}: "${id}" does not say whether a user meets it, so nothing can decide ` +
        'whether it has to carry its maturity label.',
    );
    return;
  }
  if (!governance.userFacing) return;
  const labels = read(repoRoot, REGISTRY_MODULE);
  if (labels !== null && !new RegExp(`${maturity}:\\s*'[^']+'`).test(labels)) {
    errors.push(
      `${REGISTRY_MODULE}: "${id}" is user facing at ${maturity} and that stage resolves no label, ` +
        'so a user meets an unfinished feature with nothing telling them it is unfinished.',
    );
  }
}

export function checkFeatureMaturity(repoRoot) {
  const errors = [];
  const maturities = checkVocabularies(repoRoot, errors);
  const raw = read(repoRoot, REGISTRY_PATH);
  if (raw === null) {
    errors.push(`${REGISTRY_PATH}: the feature registry is gone; no feature has a maturity.`);
    return { errors, features: 0, unfinished: 0 };
  }
  const switches = killSwitchVocabulary(repoRoot);
  if (switches === null) {
    errors.push(
      `${CAPABILITIES} and ${KILL_SWITCHES}: the kill-switch vocabulary could not be read, so no ` +
        "feature's rollback plan can be resolved.",
    );
  }
  const features = JSON.parse(raw).features ?? {};
  const rings = new Map();
  let unfinished = 0;
  for (const [id, definition] of Object.entries(features)) {
    if (definition?.maturity !== GENERALLY_AVAILABLE) unfinished += 1;
    if (maturities === null) continue;
    checkGovernance({
      repoRoot,
      id,
      definition,
      maturities,
      switches: switches ?? [],
      rings,
      errors,
    });
  }
  return { errors, features: Object.keys(features).length, unfinished };
}

function main() {
  const repoRoot = path.resolve(process.argv[2] ?? process.cwd());
  const { errors, features, unfinished } = checkFeatureMaturity(repoRoot);
  if (errors.length > 0) {
    console.error('Feature maturity check failed:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `Feature maturity check passed (${features} features, ${unfinished} below general ` +
      'availability, each with an owner, a switch, a ring and an exit).',
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
