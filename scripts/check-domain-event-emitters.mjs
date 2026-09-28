#!/usr/bin/env node

// A durable event name is a contract with every consumer, so it is declared
// once, in the cloud-contracts catalog, and minted only through
// createDomainEventEnvelope. This check reads the catalog and every module
// that mints envelopes: an emitter may only use a catalogued name, a module
// that mints envelopes has to be named here so its names are read, and a
// catalogued event nothing emits is a recorded gap until something does.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CATALOG_PATH = 'packages/contracts/cloud-contracts/src/domain-events.ts';

export const EMITTERS = Object.freeze(['apps/web/lib/audit-domain-events.ts']);

export const SCANNED_ROOTS = Object.freeze(['apps', 'services', 'packages']);

const READ_MODEL_GAP =
  'A read-model event: nothing outside the writing service reacts to it yet, so no sink records it.';
const AUDIT_GAP =
  'Consequential, so it owes an audit record, and no audit event type is written for it yet.';

export const RECORDED_GAPS = Object.freeze({
  'chat.conversation.created': READ_MODEL_GAP,
  'chat.conversation.archived': AUDIT_GAP,
  'chat.conversation.deleted': AUDIT_GAP,
  'chat.conversation.restored': AUDIT_GAP,
  'chat.conversation.purged': AUDIT_GAP,
  'chat.message.created': READ_MODEL_GAP,
  'project.project.created': READ_MODEL_GAP,
  'project.project.deleted': AUDIT_GAP,
  'project.knowledge.created': READ_MODEL_GAP,
  'memory.entry.created': READ_MODEL_GAP,
  'memory.entry.deleted': AUDIT_GAP,
  'schedule.run.started': READ_MODEL_GAP,
  'schedule.run.completed': READ_MODEL_GAP,
  'schedule.run.failed': AUDIT_GAP,
  'artifact.version.created': READ_MODEL_GAP,
  'artifact.share.published': AUDIT_GAP,
  'billing.reservation.resolved': READ_MODEL_GAP,
  'trust.egress.approved': AUDIT_GAP,
});

const SKIP_DIRECTORY =
  /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|target$|__tests__$|__mocks__$|__fixtures__$|e2e$)/;
const SOURCE_FILE = /\.(?:tsx?|mts|mjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[tj]sx?$/;
const EVENT_NAME = /'([a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z]+)'/g;
const MINTS_ENVELOPE = /\bcreateDomainEventEnvelope\s*\(/;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function readCatalog(source) {
  const verbs = /export const DOMAIN_EVENT_VERBS = \[([\s\S]*?)\]/.exec(source);
  const names = [
    ...source.matchAll(/\bdefine\(\s*'([a-z][a-z0-9]*)',\s*'([a-z][a-z0-9]*)',\s*'([a-z]+)'/g),
  ].map((match) => `${match[1]}.${match[2]}.${match[3]}`);
  return {
    verbs: verbs === null ? [] : [...verbs[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]),
    names: [...new Set(names)],
  };
}

export function emittedNames(source) {
  return [...new Set([...source.matchAll(EVENT_NAME)].map((match) => match[1]))];
}

function sourceFiles(repoRoot, relativeRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY.test(entry.name)) walk(relative);
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk(relativeRoot);
  return files;
}

export function checkDomainEventEmitters(
  repoRoot = REPO_ROOT,
  { emitters = EMITTERS, gaps = RECORDED_GAPS } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const catalogSource = read(repoRoot, CATALOG_PATH);
  if (catalogSource === null) {
    fail(`${CATALOG_PATH} is missing, so no event name can be checked`);
    return failures;
  }
  const catalog = readCatalog(catalogSource);
  if (catalog.names.length === 0 || catalog.verbs.length === 0) {
    fail(`${CATALOG_PATH} no longer declares its verbs and events in a shape this check reads`);
    return failures;
  }

  const emitted = new Map();
  for (const file of emitters) {
    const source = read(repoRoot, file);
    if (source === null) {
      fail(`${file} is a named emitter that is not in the tree`);
      continue;
    }
    const names = emittedNames(source);
    if (names.length === 0) fail(`${file} is a named emitter that emits no event name`);
    for (const name of names) {
      if (!catalog.names.includes(name)) {
        fail(
          `${file} emits '${name}', which ${CATALOG_PATH} does not declare. Add it to the catalog or use a catalogued name.`,
        );
        continue;
      }
      emitted.set(name, file);
    }
  }

  for (const root of SCANNED_ROOTS) {
    for (const file of sourceFiles(repoRoot, root)) {
      if (file === CATALOG_PATH || emitters.includes(file)) continue;
      const source = read(repoRoot, file);
      if (source !== null && MINTS_ENVELOPE.test(source)) {
        fail(
          `${file} mints domain event envelopes without being a named emitter, so its event names are never checked against the catalog`,
        );
      }
    }
  }

  for (const name of catalog.names) {
    if (emitted.has(name)) {
      if (gaps[name] !== undefined) {
        fail(
          `'${name}' is emitted by ${emitted.get(name)} and still recorded as a gap. Delete the gap; the list only shrinks.`,
        );
      }
    } else if (gaps[name] === undefined) {
      fail(`'${name}' is catalogued, nothing emits it, and it is not a recorded gap`);
    }
  }
  for (const [name, reason] of Object.entries(gaps)) {
    if (!catalog.names.includes(name)) {
      fail(`'${name}' is a recorded gap for an event the catalog no longer declares`);
    }
    if (typeof reason !== 'string' || reason.trim().length < 20) {
      fail(`'${name}' is a recorded gap without a reason`);
    }
  }

  return failures;
}

function main() {
  const failures = checkDomainEventEmitters();
  if (failures.length > 0) {
    console.error('Domain event emitter check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-domain-event-emitters: ${EMITTERS.length} emitter(s) use catalogued names only, ${Object.keys(RECORDED_GAPS).length} catalogued event(s) recorded as not yet emitted.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
