import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { tauriCargoFeatureMismatches } from './lib/tauri-cargo-features.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isolationConfig = {
  app: {
    macOSPrivateApi: true,
    security: { pattern: { use: 'isolation', options: { dir: 'isolation' } } },
  },
};

function manifest({ tauri, tauriBuild }) {
  return [
    '[package]',
    'name = "fixture"',
    '',
    '[dependencies]',
    `tauri = ${tauri}`,
    '',
    '[build-dependencies]',
    `tauri-build = ${tauriBuild}`,
    '',
  ].join('\n');
}

test('the desktop manifest enables every feature its tauri.conf.json selects', () => {
  const desktop = path.join(repoRoot, 'apps/desktop/src-tauri');
  assert.deepEqual(
    tauriCargoFeatureMismatches(
      readFileSync(path.join(desktop, 'Cargo.toml'), 'utf8'),
      JSON.parse(readFileSync(path.join(desktop, 'tauri.conf.json'), 'utf8')),
    ),
    [],
  );
});

test('a tauri-build without the isolation feature is reported', () => {
  assert.deepEqual(
    tauriCargoFeatureMismatches(
      manifest({
        tauri: '{ version = "2", features = ["tray-icon", "macos-private-api", "isolation"] }',
        tauriBuild: '{ version = "2", features = [] }',
      }),
      isolationConfig,
    ),
    ['tauri-build in [build-dependencies] lacks the isolation feature'],
  );
});

test('a tauri without the isolation feature is reported', () => {
  assert.deepEqual(
    tauriCargoFeatureMismatches(
      manifest({
        tauri: '{ version = "2", features = ["tray-icon", "macos-private-api"] }',
        tauriBuild: '{ version = "2", features = ["isolation"] }',
      }),
      isolationConfig,
    ),
    ['tauri in [dependencies] lacks the isolation feature'],
  );
});

test('a plain version string carries no features and is reported', () => {
  assert.deepEqual(
    tauriCargoFeatureMismatches(manifest({ tauri: '"2"', tauriBuild: '"2"' }), isolationConfig),
    [
      'tauri-build in [build-dependencies] lacks the isolation feature',
      'tauri in [dependencies] lacks the macos-private-api, isolation features',
    ],
  );
});

test('a feature the config does not select is reported, and tray-icon is left to the app', () => {
  assert.deepEqual(
    tauriCargoFeatureMismatches(
      manifest({
        tauri: '{ version = "2", features = ["tray-icon", "isolation"] }',
        tauriBuild: '{ version = "2", features = ["isolation"] }',
      }),
      { app: { security: { pattern: { use: 'brownfield' } } } },
    ),
    [
      'tauri-build in [build-dependencies] enables isolation, which tauri.conf.json does not select',
      'tauri in [dependencies] enables isolation, which tauri.conf.json does not select',
    ],
  );
});

test('target-specific declarations are checked when there is no top-level one', () => {
  const text = [
    '[package]',
    'name = "fixture"',
    '',
    '[target.\'cfg(not(target_os = "ios"))\'.dependencies]',
    'tauri = { version = "2", features = ["macos-private-api"] }',
    '',
    '[build-dependencies]',
    'tauri-build = { version = "2", features = ["isolation"] }',
    '',
  ].join('\n');
  assert.deepEqual(tauriCargoFeatureMismatches(text, isolationConfig), [
    'tauri in [target.\'cfg(not(target_os = "ios"))\'.dependencies] lacks the isolation feature',
  ]);
});

test('a manifest that does not declare tauri-build is reported', () => {
  assert.deepEqual(
    tauriCargoFeatureMismatches(
      '[package]\nname = "fixture"\n\n[dependencies]\ntauri = { version = "2", features = ["macos-private-api", "isolation"] }\n',
      isolationConfig,
    ),
    ['tauri-build is not declared in [build-dependencies]'],
  );
});
