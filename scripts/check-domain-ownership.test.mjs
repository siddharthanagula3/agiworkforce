import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  CAPABILITY_SOURCE,
  CONCEPT_SOURCE,
  REGISTRY_PATH,
  REGISTRY_TYPES_PATH,
  REPO_ROOT,
  checkDomainOwnership,
  loadRegistry,
  readConceptNames,
  readPlatformCapabilities,
} from './check-domain-ownership.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-domain-ownership.mjs');
const MIGRATIONS = 'apps/web/db/neon';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/** The real repository with one file swapped, so the guard sees real inputs. */
function sandbox(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), 'domain-ownership-'));
  sandboxes.push(dir);
  for (const relative of [CAPABILITY_SOURCE, CONCEPT_SOURCE, REGISTRY_PATH, REGISTRY_TYPES_PATH]) {
    mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), path.join(dir, relative));
  }
  cpSync(path.join(REPO_ROOT, MIGRATIONS), path.join(dir, MIGRATIONS), { recursive: true });
  const registry = loadRegistry(dir);
  mutate(registry, dir);
  writeFileSync(path.join(dir, REGISTRY_PATH), JSON.stringify(registry), 'utf8');
  return dir;
}

/** Owner paths are repository paths; the sandbox only holds the inputs. */
function withoutOwnerErrors(errors) {
  return errors.filter((error) => !error.includes('names owner '));
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('a table no domain claims fails', () => {
  const dir = sandbox((registry) => {
    const domain = registry.domains.find((entry) => entry.tables.includes('web_conversations'));
    domain.tables = domain.tables.filter((table) => table !== 'web_conversations');
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.deepEqual(errors, [
    `${REGISTRY_PATH}: table "web_conversations" has no owning domain. Every table belongs to exactly one.`,
  ]);
});

test('a table two domains claim fails', () => {
  const dir = sandbox((registry) => {
    registry.domains.find((entry) => entry.name === 'audit').tables.push('web_conversations');
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /is claimed by both "chat" and "audit"/);
});

test('a capability no domain claims fails', () => {
  const dir = sandbox((registry) => {
    const domain = registry.domains.find((entry) => entry.capabilities.includes('canUseVoice'));
    domain.capabilities = domain.capabilities.filter((capability) => capability !== 'canUseVoice');
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.deepEqual(errors, [
    `${REGISTRY_PATH}: capability "canUseVoice" has no owning domain. Every capability belongs to exactly one.`,
  ]);
});

test('a concept no domain claims fails', () => {
  const dir = sandbox((registry) => {
    const domain = registry.domains.find((entry) => entry.concepts.includes('memory'));
    domain.concepts = domain.concepts.filter((concept) => concept !== 'memory');
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.deepEqual(errors, [
    `${REGISTRY_PATH}: concept "memory" has no owning domain. Every concept belongs to exactly one.`,
  ]);
});

test('a claim on something that does not exist fails', () => {
  const dir = sandbox((registry) => {
    registry.domains[0].tables.push('tables_that_never_shipped');
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /claims table "tables_that_never_shipped", which does not exist/);
});

test('two domains under one label fail', () => {
  const dir = sandbox((registry) => {
    registry.domains.push({
      name: 'memories',
      label: registry.domains.find((entry) => entry.name === 'memory').label,
      owner: 'apps/web/lib/memory',
      capabilities: [],
      concepts: [],
      tables: [],
    });
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.ok(
    errors.some((error) => error.includes('names two domains')),
    errors.join('\n'),
  );
});

test('a domain the typed vocabulary does not name fails', () => {
  const dir = sandbox((registry) => {
    registry.domains.push({
      name: 'telepathy',
      label: 'Telepathy',
      owner: 'apps/web/lib/memory',
      capabilities: [],
      concepts: [],
      tables: [],
    });
  });
  const errors = withoutOwnerErrors(checkDomainOwnership(dir).errors);
  assert.ok(
    errors.some((error) => error.includes('PRODUCT_DOMAINS omits "telepathy"')),
    errors.join('\n'),
  );
});

test('the populations are read from their sources, not restated here', () => {
  assert.ok(readPlatformCapabilities(REPO_ROOT).includes('canChat'));
  assert.ok(readConceptNames(REPO_ROOT).includes('conversation'));
});
