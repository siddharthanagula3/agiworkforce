import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONCEPT_REGISTRY_PATH,
  FEATURE_REGISTRY_PATH,
  MATRIX_PATH,
  MODEL_CATALOG_PATH,
  RENDERED_PATH,
  REPO_ROOT,
  collectViolations,
  declaredMaturity,
  mountReachesEntry,
  readMaturities,
  readSurfaces,
  renderMatrix,
} from './check-surface-feature-matrix.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const SURFACES = ['web', 'cli'];
const ENTRY = 'apps/web/features/chat/ChatPage.tsx';
const MOUNT = 'apps/web/features/chat/index.ts';
const WORKFLOW = '.github/workflows/deploy-production.yml';
const REGISTRY = { work: { label: 'Work', maturity: 'beta' } };

function baseMatrix(overrides = {}) {
  return {
    why: 'Where each feature lives.',
    surfaceNotes: { web: 'The web application.', cli: 'The command line.' },
    releaseWorkflows: { web: WORKFLOW, cli: null },
    groups: [{ id: 'core', title: 'Core' }],
    features: [
      {
        id: 'chat',
        label: 'Chat',
        group: 'core',
        featureId: 'work',
        cells: {
          web: { state: 'present', via: 'import', entry: ENTRY, mount: MOUNT },
          cli: { state: 'absent', why: 'The terminal has no composer.' },
        },
      },
    ],
    ...overrides,
  };
}

function scaffold(matrix, { rendered, mountSource } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'surface-matrix-'));
  roots.push(root);
  write(root, CONCEPT_REGISTRY_PATH, JSON.stringify({ originSurfaces: SURFACES }, null, 2));
  write(root, FEATURE_REGISTRY_PATH, JSON.stringify({ features: REGISTRY }, null, 2));
  write(
    root,
    MODEL_CATALOG_PATH,
    "export const FEATURE_MATURITIES = [\n  'experimental',\n  'beta',\n  'general_availability',\n  'deprecated',\n] as const;\n",
  );
  write(root, WORKFLOW, 'name: deploy\n');
  write(root, ENTRY, 'export function ChatPage() {}\n');
  write(root, MOUNT, mountSource ?? "export { ChatPage } from './ChatPage';\n");
  write(root, MATRIX_PATH, JSON.stringify(matrix, null, 2));
  write(root, RENDERED_PATH, rendered ?? renderMatrix(matrix, SURFACES, REGISTRY));
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a matrix whose present cells are reached passes', () => {
  assert.deepEqual(collectViolations(scaffold(baseMatrix())), []);
});

test('a mount that does not reach its entry fails', () => {
  const violations = collectViolations(
    scaffold(baseMatrix(), { mountSource: "export { Other } from './Other';\n" }),
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /does not import/);
});

test('a maturity word in a surface cell fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].cells.cli = { state: 'general_availability', entry: ENTRY, mount: MOUNT };
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /is a maturity word/.test(violation)));
});

test('a present cell with only one path fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].cells.web = { state: 'present', via: 'import', entry: ENTRY };
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /carries no mount/.test(violation)));
});

test('a directory as an entry point fails, because a directory is not an entry point', () => {
  const matrix = baseMatrix();
  matrix.features[0].cells.web.entry = 'apps/web/features/chat';
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /A directory is not an entry\s+point/.test(violation)));
});

test('naming the same file as entry and mount fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].cells.web.mount = ENTRY;
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /reaches nothing/.test(violation)));
});

test('a partial cell that does not name what is missing fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].cells.web = { state: 'partial', via: 'import', entry: ENTRY, mount: MOUNT };
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /carries no missing/.test(violation)));
});

test('a surface that says nothing about a release workflow fails', () => {
  const matrix = baseMatrix();
  delete matrix.releaseWorkflows.cli;
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /Never whether it has run/.test(violation)));
});

test('a release workflow path that is gone fails', () => {
  const matrix = baseMatrix({ releaseWorkflows: { web: '.github/workflows/gone.yml', cli: null } });
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /which is gone/.test(violation)));
});

test('a row that declares its own maturity fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].maturity = 'general_availability';
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /Maturity comes from/.test(violation)));
});

test('a registry feature no row names fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].featureId = null;
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /the feature registry has "work"/.test(violation)));
});

test('an unverified cell with no way to settle it fails', () => {
  const matrix = baseMatrix();
  matrix.features[0].cells.cli = { state: 'unverified' };
  const violations = collectViolations(scaffold(matrix));
  assert.ok(violations.some((violation) => /carries no settledBy/.test(violation)));
});

test('a stale rendered document fails', () => {
  const violations = collectViolations(scaffold(baseMatrix(), { rendered: '# stale\n' }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /is stale against/);
});

test('the rendered document says what it does not say, and never claims a release ran', () => {
  const rendered = renderMatrix(baseMatrix(), SURFACES, REGISTRY);
  assert.match(rendered, /## What this matrix does not say/);
  assert.match(rendered, /Presence in the tree is not availability to a user/);
  assert.match(rendered, /Whether it has ever run is not in this tree/);
  assert.match(rendered, /no release workflow for this surface exists in the tree/);
  assert.doesNotMatch(rendered, /\bGA\b/);
});

test('a row outside the registry shows no maturity rather than guessing one', () => {
  assert.equal(declaredMaturity(REGISTRY, 'work'), 'beta');
  assert.equal(declaredMaturity(REGISTRY, null), 'not in the feature registry');
  assert.equal(declaredMaturity(REGISTRY, 'ghost'), 'not in the feature registry');
});

test('each mount relation is decided from the two files', () => {
  const root = scaffold(baseMatrix());
  assert.equal(
    mountReachesEntry({ repoRoot: root, entry: ENTRY, mount: MOUNT, via: 'import' }),
    true,
  );
  assert.equal(
    mountReachesEntry({ repoRoot: root, entry: ENTRY, mount: MOUNT, via: 'route' }),
    false,
  );
  assert.equal(
    mountReachesEntry({ repoRoot: root, entry: ENTRY, mount: MOUNT, via: 'module' }),
    false,
  );
});

test('the vocabularies are read from the tree, not restated here', () => {
  assert.equal(readSurfaces(REPO_ROOT).includes('api'), true);
  assert.deepEqual(readMaturities(REPO_ROOT), [
    'experimental',
    'beta',
    'general_availability',
    'deprecated',
  ]);
});
