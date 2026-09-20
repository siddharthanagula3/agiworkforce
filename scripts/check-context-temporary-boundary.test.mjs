import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  TAXONOMY_PATH,
  auditCallSite,
  auditRepository,
  guardedLoaders,
} from './check-context-temporary-boundary.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-context-temporary-boundary.mjs');

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-temporary-boundary-'));
  sandboxes.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return dir;
}

after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const TAXONOMY = [
  'const POLICIES = {',
  '  account_memory: {',
  "    sourceClass: 'account_memory',",
  '    excludedFromTemporaryChat: true,',
  '    producedBy: [',
  '      {',
  "        surface: 'web',",
  "        module: 'apps/web/lib/services/memory-loader.ts',",
  "        loader: 'loadTheMemories',",
  '      },',
  '    ],',
  '  },',
  '  user_upload: {',
  "    sourceClass: 'user_upload',",
  '    excludedFromTemporaryChat: false,',
  '    producedBy: [',
  '      {',
  "        surface: 'web',",
  "        module: 'apps/web/lib/services/upload-loader.ts',",
  "        loader: 'loadTheUploads',",
  '      },',
  '    ],',
  '  },',
  '};',
].join('\n');

const COMPLIANT = [
  'export async function enrich(params) {',
  '  if (params.isTemporary) return;',
  '  const policy = await loadManagedMemoryPolicy(db, params);',
  '  if (!policy.enabled) return;',
  '  return loadTheMemories(db, params);',
  '}',
].join('\n');

const LEAKY = [
  'export async function enrich(params) {',
  '  return loadTheMemories(db, params);',
  '}',
].join('\n');

test('takes the guarded loaders out of the taxonomy, not out of a hand-written list', () => {
  const loaders = guardedLoaders(TAXONOMY);
  assert.deepEqual(loaders, [
    {
      sourceClass: 'account_memory',
      module: 'apps/web/lib/services/memory-loader.ts',
      loader: 'loadTheMemories',
    },
  ]);
});

test('reads the real taxonomy and finds the memory loader among the excluded classes', () => {
  const loaders = guardedLoaders(readFileSync(path.join(REPO_ROOT, TAXONOMY_PATH), 'utf8'));
  assert.ok(loaders.some((entry) => entry.loader === 'loadManagedMemoryContext'));
  assert.ok(loaders.every((entry) => entry.module.startsWith('apps/')));
});

test('passes a call site that names the boundary and the policy', () => {
  assert.deepEqual(auditCallSite('apps/web/x.ts', COMPLIANT, ['loadTheMemories']), []);
});

test('fails a call site that loads memory without either', () => {
  const failures = auditCallSite('apps/web/x.ts', LEAKY, ['loadTheMemories']);
  assert.equal(failures.length, 2);
  assert.match(failures.join('\n'), /temporary boundary/);
  assert.match(failures.join('\n'), /memory policy/);
});

test('accepts a call site that resolves through the engine instead', () => {
  const viaEngine = ['const r = await resolveContext({ loaders });', 'loadTheMemories(db);'].join(
    '\n',
  );
  const failures = auditCallSite('apps/web/x.ts', `${viaEngine}\nManagedMemoryPolicy`, [
    'loadTheMemories',
  ]);
  assert.deepEqual(failures, []);
});

test('exits non-zero on a tree whose call site skips the boundary', () => {
  const dir = makeSandbox({
    [TAXONOMY_PATH]: TAXONOMY,
    'apps/web/lib/services/memory-loader.ts': 'export async function loadTheMemories() {}',
    'apps/web/app/api/leak/route.ts': LEAKY,
  });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /never names the temporary boundary/);
});

test('exits non-zero when the taxonomy is gone', () => {
  const dir = makeSandbox({ 'apps/web/app/api/x/route.ts': 'export const a = 1;' });
  const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is missing/);
});

test('holds over the repository it guards', () => {
  const { callSites, failures } = auditRepository(REPO_ROOT);
  assert.deepEqual(failures, []);
  assert.ok(callSites > 0);
});
