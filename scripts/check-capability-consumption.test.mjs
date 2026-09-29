import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPABILITY_READERS,
  MATRIX_PROVIDERS,
  RECORDED_EXCEPTIONS,
  REPO_ROOT,
  SURFACE_VOCABULARY_PATH,
  checkCapabilityConsumption,
  importedMatrixSymbols,
  readSurfaces,
  readsDeploymentFlag,
} from './check-capability-consumption.mjs';

const roots = [];

function fixture({ edits = {}, added = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-capability-consumption-'));
  roots.push(root);
  const files = new Set([SURFACE_VOCABULARY_PATH, ...MATRIX_PROVIDERS]);
  for (const entry of Object.values(CAPABILITY_READERS)) {
    for (const reader of entry.reads ?? []) files.add(reader.file);
  }
  for (const file of Object.keys(RECORDED_EXCEPTIONS)) files.add(file);
  for (const relative of files) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  for (const entry of Object.values(CAPABILITY_READERS)) {
    if (entry.owner) mkdirSync(path.join(root, entry.owner), { recursive: true });
  }
  for (const [relative, edit] of Object.entries(edits)) {
    const absolute = path.join(root, relative);
    writeFileSync(absolute, edit(readFileSync(absolute, 'utf8')));
  }
  for (const [relative, source] of Object.entries(added)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands measures every surface', () => {
  assert.deepEqual(checkCapabilityConsumption(REPO_ROOT), []);
});

test('the surfaces come from the vocabulary and each one is recorded', () => {
  const surfaces = readSurfaces(REPO_ROOT);
  assert.ok(surfaces.includes('chrome') && surfaces.includes('cli'), surfaces.join(','));
  for (const surface of surfaces) {
    assert.ok(CAPABILITY_READERS[surface] !== undefined, `${surface} is unmeasured`);
  }
  assert.deepEqual(checkCapabilityConsumption(fixture()), []);
});

test('a reader that stops reading the document fails', () => {
  const root = fixture({
    edits: {
      'apps/web/shared/stores/web-auth-store.ts': (source) =>
        source.replaceAll('capability_handshake', 'disabled_features'),
    },
  });
  assert.ok(
    checkCapabilityConsumption(root).some((entry) =>
      /web-auth-store\.ts no longer shows \/capability_handshake\//.test(entry),
    ),
  );
});

test('a client that decides from the static matrix fails', () => {
  const root = fixture({
    added: {
      'apps/web/features/example/Gate.tsx':
        "import { isCapabilityEnabled as enabled } from '@agiworkforce/types';\nexport const open = enabled('web', 'canUseVoice');\n",
    },
  });
  assert.ok(
    checkCapabilityConsumption(root).some((entry) =>
      /Gate\.tsx imports isCapabilityEnabled and decides a capability/.test(entry),
    ),
  );
});

test('a client that re-reads the deployment flag the document folds in fails', () => {
  const root = fixture({
    added: {
      'apps/web/features/example/Code.tsx':
        'export const on = (state: { featureFlags?: { code_execution?: boolean } }) => state.featureFlags?.code_execution;\n',
    },
  });
  assert.ok(
    checkCapabilityConsumption(root).some((entry) =>
      /Code\.tsx reads feature_flags\.code_execution/.test(entry),
    ),
  );
});

test('a gap that closes fails until it is recorded as a reader', () => {
  const root = fixture({
    added: {
      'apps/cli/src/capabilities.rs':
        'pub struct Me { pub capability_handshake: Option<String> }\n',
    },
  });
  const readers = {
    ...CAPABILITY_READERS,
    cli: {
      gap: 'The CLI resolves plan capabilities locally and does not read the served document yet.',
      owner: 'apps/cli',
    },
  };
  assert.ok(
    checkCapabilityConsumption(root, { readers }).some((entry) =>
      /the cli gap has closed/.test(entry),
    ),
  );
});

test('a recorded exception that is fixed fails until it is deleted', () => {
  const file = 'apps/web/features/example/Legacy.tsx';
  const exceptions = {
    ...RECORDED_EXCEPTIONS,
    [file]: { rule: 'matrix', why: 'reads the matrix today', fix: 'read the document' },
  };
  const broken = fixture({
    added: {
      [file]:
        "import { getPlatformCapabilities } from '@agiworkforce/types';\nexport const row = getPlatformCapabilities('web');\n",
    },
  });
  assert.deepEqual(checkCapabilityConsumption(broken, { exceptions }), []);
  const fixed = fixture({ added: { [file]: 'export const row = null;\n' } });
  assert.ok(
    checkCapabilityConsumption(fixed, { exceptions }).some((entry) =>
      /Legacy\.tsx no longer breaks the matrix rule/.test(entry),
    ),
  );
});

test('the provider may fall back to the matrix only after consulting the document', () => {
  const root = fixture({
    edits: {
      'packages/ui/unified-chat/src/lib/capabilities.tsx': (source) =>
        source.replaceAll('resolveCapabilityDocumentDecision(', 'ignoreDocument('),
    },
  });
  assert.ok(
    checkCapabilityConsumption(root).some((entry) =>
      /decides capabilities from the static matrix without consulting the document/.test(entry),
    ),
  );
});

test('only value imports of the matrix count, and every read of the flag counts', () => {
  assert.deepEqual(
    importedMatrixSymbols(
      "import { type PlatformCapability, getPlatformCapabilities as row } from '@agiworkforce/types/capabilities';",
    ),
    ['getPlatformCapabilities'],
  );
  assert.deepEqual(
    importedMatrixSymbols("import type { isCapabilityEnabled } from '@agiworkforce/types';"),
    [],
  );
  assert.equal(readsDeploymentFlag('data.feature_flags.code_execution ?? false'), true);
  assert.equal(readsDeploymentFlag('code_execution?: boolean;'), false);
});
