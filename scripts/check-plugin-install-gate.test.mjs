import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compareToBaseline,
  gatedBy,
  topLevelFunctions,
  ungatedWrites,
} from './check-plugin-install-gate.mjs';

function scratch(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-install-gate-'));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const GATED = `
export async function installWebPlugin(db: DatabaseAdapter, userId: string) {
  await assertPluginPackageInstallable(db, claim);
  await db.query(\`insert into public.plugin_installations
     (user_id, plugin_id, installed_version) values ($1, $2, $3)\`, [userId]);
}
`;

const UNGATED = `
export async function installWebPlugin(db: DatabaseAdapter, userId: string) {
  await db.query(\`insert into public.plugin_installations
     (user_id, plugin_id, installed_version) values ($1, $2, $3)\`, [userId]);
}
`;

test('a write with no gate is reported', () => {
  const root = scratch({ 'apps/web/lib/services/plugin-a.ts': UNGATED });
  const result = ungatedWrites(root);
  assert.equal(result.writes, 1);
  assert.deepEqual(result.open, ['apps/web/lib/services/plugin-a.ts#installWebPlugin']);
});

test('a write behind the gate is not reported', () => {
  const root = scratch({ 'apps/web/lib/services/plugin-a.ts': GATED });
  const result = ungatedWrites(root);
  assert.equal(result.writes, 1);
  assert.deepEqual(result.open, []);
});

test('an update that sets installed_version counts as an admitting write', () => {
  const root = scratch({
    'apps/web/lib/services/plugin-a.ts': `
export async function applyUpdate(db: DatabaseAdapter) {
  await db.execute(\`update public.plugin_installations set installed_version = $3\`, []);
}
`,
  });
  assert.deepEqual(ungatedWrites(root).open, ['apps/web/lib/services/plugin-a.ts#applyUpdate']);
});

test('a test file beside the service is not scanned', () => {
  const root = scratch({ 'apps/web/lib/services/plugin-a.test.ts': UNGATED });
  assert.equal(ungatedWrites(root).writes, 0);
});

test('an inline parameter type does not hide the body', () => {
  const source = `
export async function applyUpdate(
  db: DatabaseAdapter,
  input: { userId: string; pluginId: string },
): Promise<void> {
  await db.execute(\`update public.plugin_installations set installed_version = $3\`, []);
}
`;
  const [fn] = topLevelFunctions(source);
  assert.equal(fn.name, 'applyUpdate');
  assert.ok(fn.body.includes('installed_version'));
});

test('a private helper is gated by the exported function that reaches it', () => {
  const functions = topLevelFunctions(`
async function upsertInstallation(db: DatabaseAdapter) {
  await db.query(\`insert into public.plugin_installations (installed_version) values ($1)\`, []);
}
export async function storeOwned(db: DatabaseAdapter) {
  await assertScanned(db);
  return upsertInstallation(db);
}
async function assertScanned(db: DatabaseAdapter) {
  const result = await scanAndRecordPluginPackage(db);
  if (result.verdict !== 'pass') throw new PluginPackageRefusedError('scan_blocked', 'no');
}
`);
  const helper = functions.find((fn) => fn.name === 'upsertInstallation');
  assert.ok(gatedBy(helper, functions));
});

test('a private helper whose caller never refuses stays open', () => {
  const functions = topLevelFunctions(`
async function upsertInstallation(db: DatabaseAdapter) {
  await db.query(\`insert into public.plugin_installations (installed_version) values ($1)\`, []);
}
export async function storeOwned(db: DatabaseAdapter) {
  return upsertInstallation(db);
}
`);
  const helper = functions.find((fn) => fn.name === 'upsertInstallation');
  assert.equal(gatedBy(helper, functions), false);
});

test('a baselined entry without a reason fails', () => {
  const { missingReason } = compareToBaseline(['a#b'], { ungated: { 'a#b': {} } });
  assert.deepEqual(missingReason, ['a#b']);
});

test('a new ungated path is growth', () => {
  const { grown } = compareToBaseline(['a#b', 'c#d'], {
    ungated: { 'a#b': { reason: 'r', gateIn: 'f' } },
  });
  assert.deepEqual(grown, ['c#d']);
});

test('a baselined path that is now gated must be removed', () => {
  const { fixed } = compareToBaseline([], { ungated: { 'a#b': { reason: 'r', gateIn: 'f' } } });
  assert.deepEqual(fixed, ['a#b']);
});
