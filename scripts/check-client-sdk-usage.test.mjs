import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  HANDSHAKE_CONTRACT_PATH,
  REPO_ROOT,
  collectViolations,
  loadClients,
  loadContract,
} from './check-client-sdk-usage.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const OWNER_MODULE = 'packages/contracts/cloud-contracts/src/client-handshake.ts';
const OWNER_PACKAGE = '@agiworkforce/cloud-contracts';
const CONSUMER = 'apps/desktop/src/lib/platformHeaders.ts';
const OTHER = 'apps/desktop/src/lib/other.ts';

function contract(overrides = {}) {
  return {
    why: 'test',
    concerns: {
      handshake: {
        owner: { module: OWNER_MODULE, package: OWNER_PACKAGE, symbol: 'clientHandshakeHeaders' },
        headerLiterals: ['x-agi-surface'],
        roots: ['apps/desktop/src'],
        permittedCallSites: [],
        clients: { desktop: { consumes: CONSUMER } },
        ...overrides,
      },
    },
  };
}

function scaffold({
  concern = contract(),
  consumer = `import { clientHandshakeHeaders } from '${OWNER_PACKAGE}';\nexport const h = clientHandshakeHeaders;\n`,
  other = 'export const nothing = 1;\n',
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'client-sdk-'));
  roots.push(root);
  write(root, OWNER_MODULE, 'export const clientHandshakeHeaders = () => ({});\n');
  write(root, CONSUMER, consumer);
  write(root, OTHER, other);
  write(root, CONTRACT_PATH, JSON.stringify(concern, null, 2));
  write(
    root,
    HANDSHAKE_CONTRACT_PATH,
    JSON.stringify({ clients: [{ surface: 'desktop' }] }, null, 2),
  );
  return root;
}

const FILES = [OWNER_MODULE, CONSUMER, OTHER];

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a client that goes through the shared module passes', () => {
  assert.deepEqual(collectViolations(scaffold(), FILES), []);
});

test('a call site that spells the header itself fails', () => {
  const violations = collectViolations(
    scaffold({ other: "export const h = { 'x-agi-surface': 'desktop' };\n" }),
    FILES,
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /apps\/desktop\/src\/lib\/other\.ts writes "x-agi-surface"/);
});

test('a client the handshake contract declares and this one does not fails', () => {
  const concern = contract({ clients: {} });
  const violations = collectViolations(scaffold({ concern }), FILES);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /nothing says whether this client uses the shared module/);
});

test('a consumer that stopped naming the symbol fails', () => {
  const violations = collectViolations(
    scaffold({ consumer: 'export const h = () => ({});\n' }),
    FILES,
  );
  assert.ok(
    violations.some((violation) => /no longer names clientHandshakeHeaders/.test(violation)),
  );
});

test('a consumer with its own copy of the symbol fails', () => {
  const violations = collectViolations(
    scaffold({ consumer: 'export const clientHandshakeHeaders = () => ({});\n' }),
    FILES,
  );
  assert.ok(violations.some((violation) => /local copy of the same idea/.test(violation)));
});

test('a permitted call site that no longer spells the header fails', () => {
  const concern = contract({ permittedCallSites: [OTHER] });
  const violations = collectViolations(scaffold({ concern }), FILES);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Delete the entry so the list cannot become an allowlist/);
});

test('a gap with no reason fails', () => {
  const concern = contract({ clients: { desktop: { gap: '' } } });
  const violations = collectViolations(scaffold({ concern }), FILES);
  assert.ok(violations.some((violation) => /recorded as a gap with no reason/.test(violation)));
});

test('the real contract answers for every client the handshake declares', () => {
  const real = loadContract(REPO_ROOT);
  const surfaces = loadClients(REPO_ROOT).map((client) => client.surface);
  assert.ok(surfaces.length >= 6);
  for (const concern of Object.values(real.concerns)) {
    for (const surface of surfaces) assert.ok(concern.clients[surface] !== undefined, surface);
  }
});
