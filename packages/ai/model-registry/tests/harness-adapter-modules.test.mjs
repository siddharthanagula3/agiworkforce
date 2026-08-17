import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..', '..');
const HARNESSES_JSON = path.join(PACKAGE_ROOT, 'catalog', 'harnesses.json');
const GENERATED_REGISTRIES = [
  path.join(PACKAGE_ROOT, 'generated', 'registry.json'),
  path.join(
    REPO_ROOT,
    'crates',
    'agiworkforce-protocol',
    'src',
    'generated',
    'model_registry.json',
  ),
  path.join(
    REPO_ROOT,
    'crates',
    'agiworkforce-model-registry',
    'src',
    'generated',
    'model_registry.json',
  ),
];

// Bare adapter names denote a runtime route with no importable module, so nothing on disk can
// prove them. The set is closed: deleting a module must not leave its name behind in the catalog.
const RUNTIME_ROUTE_ADAPTERS = new Set(['desktop-direct-api', 'managed-media']);

function readHarnesses() {
  return JSON.parse(fs.readFileSync(HARNESSES_JSON, 'utf8')).harnesses;
}

function isRepoPath(adapter) {
  return adapter.includes('/') && !adapter.startsWith('@');
}

test('harness adapters that name a repo path point at something that exists', () => {
  for (const [harnessId, harness] of Object.entries(readHarnesses())) {
    if (!isRepoPath(harness.adapter)) continue;
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, harness.adapter)),
      `${harnessId} names adapter "${harness.adapter}", which does not exist in the repo`,
    );
  }
});

test('harness adapters use no bare module name outside the runtime-route set', () => {
  for (const [harnessId, harness] of Object.entries(readHarnesses())) {
    const { adapter } = harness;
    if (isRepoPath(adapter) || adapter.startsWith('@')) continue;
    assert.ok(
      RUNTIME_ROUTE_ADAPTERS.has(adapter),
      `${harnessId} names adapter "${adapter}", which resolves to no module and no known runtime route`,
    );
  }
});

test('generated registries mirror the catalog harness adapters', () => {
  const catalog = readHarnesses();
  for (const generatedPath of GENERATED_REGISTRIES) {
    const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8')).harnesses;
    for (const [harnessId, harness] of Object.entries(catalog)) {
      assert.equal(
        generated[harnessId]?.adapter,
        harness.adapter,
        `${path.relative(REPO_ROOT, generatedPath)} is stale for ${harnessId}`,
      );
    }
  }
});
