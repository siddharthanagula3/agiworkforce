import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import { buildMergeConfig, PROD_CONFIG_PATH } from './tauri-config.mjs';

test('WDIO merge config isolates the app and exposes the native test bridge', () => {
  const config = buildMergeConfig();

  assert.equal(config.identifier, 'com.agiworkforce.desktop.wdio');
  assert.equal(config.app?.withGlobalTauri, true);
});

test('WDIO bridge permissions are enabled only in the E2E build', () => {
  const prod = JSON.parse(readFileSync(PROD_CONFIG_PATH, 'utf8'));
  const releaseCapabilities = prod.app?.security?.capabilities ?? [];
  assert.ok(!releaseCapabilities.includes('wdio'));
  assert.deepEqual(buildMergeConfig().app?.security?.capabilities, [
    'default',
    'recorder-hud',
    'wdio',
  ]);

  const shipped = JSON.parse(
    readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
  );
  const names = shipped.permissions.map((permission) =>
    typeof permission === 'string' ? permission : permission.identifier,
  );
  assert.ok(!names.some((name) => name.startsWith('wdio')));
});

test('the renderer cannot write, remove or read the app secrets in app data', () => {
  const shipped = JSON.parse(
    readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
  );
  const scoped = shipped.permissions.filter(
    (permission) => typeof permission === 'object' && permission.identifier.startsWith('fs:'),
  );
  const names = scoped.map((permission) => permission.identifier);
  for (const removed of [
    'fs:allow-remove',
    'fs:allow-rename',
    'fs:allow-copy-file',
    'fs:allow-write-file',
  ]) {
    assert.ok(!names.includes(removed), `${removed} must not be granted to the renderer`);
  }

  const write = scoped.find((permission) => permission.identifier === 'fs:allow-write-text-file');
  assert.deepEqual(write.allow, [{ path: '$APPDATA/artifacts/**' }]);

  for (const permission of scoped) {
    if (!(permission.allow ?? []).some((entry) => entry.path?.startsWith('$APPDATA'))) continue;
    const denied = (permission.deny ?? []).map((entry) => entry.path);
    for (const secret of [
      '$APPDATA/agiworkforce.db*',
      '$APPDATA/keys.stronghold',
      '$APPDATA/stronghold.salt',
      '$APPDATA/app_permissions.json',
    ]) {
      assert.ok(denied.includes(secret), `${permission.identifier} must deny ${secret}`);
    }
  }
});
