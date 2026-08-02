import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMergeConfig } from './tauri-config.mjs';

test('WDIO merge config isolates the app and exposes the native test bridge', () => {
  const config = buildMergeConfig();

  assert.equal(config.identifier, 'com.agiworkforce.desktop.wdio');
  assert.equal(config.app?.withGlobalTauri, true);
});
