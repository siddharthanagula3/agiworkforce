import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BASELINE_PATH,
  CREDENTIAL_NAME,
  PUBLISHED_CREDENTIAL_NAMES,
  REGISTRY_PATH,
  REPO_ROOT,
  checkConfigKeyCoverage,
  loadBaseline,
  readKeys,
  registeredKeys,
} from './check-config-keys.mjs';

const roots = [];

function registry(keys) {
  return [
    'const CONFIG_KEY_DESCRIPTORS: readonly ConfigKeyDescriptor[] = [',
    ...keys.map((key) => `  secret('${key}', { type: 'string' }),`),
    '];',
    'const CONFIG_KEY_REGISTRY = defineConfigKeys(CONFIG_KEY_DESCRIPTORS);',
  ].join('\n');
}

function fixture({ files, registered = [], baseline = { unregistered: [] } }) {
  const root = mkdtempSync(path.join(tmpdir(), 'config-keys-'));
  roots.push(root);
  mkdirSync(path.join(root, path.dirname(BASELINE_PATH)), { recursive: true });
  writeFileSync(path.join(root, BASELINE_PATH), JSON.stringify(baseline));
  mkdirSync(path.join(root, path.dirname(REGISTRY_PATH)), { recursive: true });
  writeFileSync(path.join(root, REGISTRY_PATH), registry(registered));
  for (const [relative, source] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a key nothing classified fails', () => {
  const root = fixture({ files: { 'src/a.ts': "const x = process.env['NEW_SECRET_KEY'];" } });
  const { errors } = checkConfigKeyCoverage(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /NEW_SECRET_KEY is read but is in neither the registry/);
});

test('both the dot and the bracket form are read', () => {
  const root = fixture({
    files: { 'src/a.ts': 'const a = process.env.DOT_KEY;\nconst b = process.env["BRACKET_KEY"];' },
  });
  const { errors } = checkConfigKeyCoverage(root, ['src']);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((error) => /DOT_KEY/.test(error)));
  assert.ok(errors.some((error) => /BRACKET_KEY/.test(error)));
});

test('a credential named for the browser bundle fails even when it is registered', () => {
  const root = fixture({
    files: { 'src/a.ts': "process.env['NEXT_PUBLIC_SESSION_SIGNING_KEY'];" },
    registered: ['NEXT_PUBLIC_SESSION_SIGNING_KEY'],
  });
  const { errors } = checkConfigKeyCoverage(root, ['src']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /writes its value into every browser bundle/);
});

test('the published credentials that are meant to be published pass', () => {
  for (const key of PUBLISHED_CREDENTIAL_NAMES) {
    assert.ok(CREDENTIAL_NAME.test(key), `${key} should look like a credential`);
    const root = fixture({ files: { 'src/a.ts': `process.env['${key}'];` }, registered: [key] });
    assert.deepEqual(checkConfigKeyCoverage(root, ['src']).errors, [], key);
  }
});

test('a registered key and a baselined key both pass', () => {
  const root = fixture({
    files: { 'src/a.ts': "process.env['A_SECRET'];\nprocess.env['B_SETTING'];" },
    registered: ['A_SECRET'],
    baseline: { unregistered: [{ key: 'B_SETTING', reason: 'the flag registry owns it' }] },
  });
  assert.deepEqual(checkConfigKeyCoverage(root, ['src']).errors, []);
});

test('a baselined key with no reason fails', () => {
  const root = fixture({
    files: { 'src/a.ts': "process.env['B_SETTING'];" },
    baseline: { unregistered: [{ key: 'B_SETTING', reason: ' ' }] },
  });
  assert.ok(checkConfigKeyCoverage(root, ['src']).errors.some((e) => /carries no reason/.test(e)));
});

test('the baseline cannot hold a key that is registered or no longer read', () => {
  const both = fixture({
    files: { 'src/a.ts': "process.env['A_SECRET'];" },
    registered: ['A_SECRET'],
    baseline: { unregistered: [{ key: 'A_SECRET', reason: 'r' }] },
  });
  assert.ok(checkConfigKeyCoverage(both, ['src']).errors.some((e) => /is registered now/.test(e)));

  const gone = fixture({
    files: { 'src/a.ts': 'const x = 1;' },
    baseline: { unregistered: [{ key: 'GONE', reason: 'r' }] },
  });
  assert.ok(checkConfigKeyCoverage(gone, ['src']).errors.some((e) => /no longer read/.test(e)));
});

test('a registered key nothing reads fails unless a reader elsewhere is named', () => {
  const stale = fixture({ files: { 'src/a.ts': 'const x = 1;' }, registered: ['STALE_KEY'] });
  assert.ok(
    checkConfigKeyCoverage(stale, ['src']).errors.some((e) => /nothing under src reads it/.test(e)),
  );

  const named = fixture({
    files: { 'src/a.ts': 'const x = 1;' },
    registered: ['STALE_KEY'],
    baseline: {
      unregistered: [],
      registeredButUnread: [{ key: 'STALE_KEY', reason: 'read by the data layer package' }],
    },
  });
  assert.deepEqual(checkConfigKeyCoverage(named, ['src']).errors, []);
});

test('an elsewhere entry with no reason, or for an unregistered key, fails', () => {
  const noReason = fixture({
    files: { 'src/a.ts': 'const x = 1;' },
    registered: ['STALE_KEY'],
    baseline: { unregistered: [], registeredButUnread: [{ key: 'STALE_KEY', reason: '' }] },
  });
  assert.ok(
    checkConfigKeyCoverage(noReason, ['src']).errors.some((e) => /names no reader/.test(e)),
  );

  const unknown = fixture({
    files: { 'src/a.ts': 'const x = 1;' },
    baseline: { unregistered: [], registeredButUnread: [{ key: 'NOT_THERE', reason: 'r' }] },
  });
  assert.ok(
    checkConfigKeyCoverage(unknown, ['src']).errors.some((e) => /is not registered/.test(e)),
  );
});

test('a scanned root with no product file fails rather than passing silently', () => {
  assert.match(
    checkConfigKeyCoverage(fixture({ files: {} }), ['src']).errors[0],
    /no product file/,
  );
});

test('the guard measures the repository and every key there is classified', () => {
  const { keys, files } = readKeys(REPO_ROOT);
  assert.ok(files > 1000, `expected the web tree, read ${files} files`);
  assert.ok(keys.size > 100, `expected the keys the web tree reads, found ${keys.size}`);

  const registered = registeredKeys(REPO_ROOT);
  assert.ok(registered.size > 30, `expected a populated registry, found ${registered.size}`);

  const baseline = loadBaseline();
  const classified = new Set([...registered, ...baseline.unregistered.map((entry) => entry.key)]);
  for (const key of keys.keys()) assert.ok(classified.has(key), `${key} is unclassified`);

  assert.deepEqual(checkConfigKeyCoverage().errors, []);
});
