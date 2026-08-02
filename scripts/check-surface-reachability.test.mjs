import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeSurface,
  buildSurfaces,
  chromeManifestEntries,
  readAllowlist,
} from './check-surface-reachability.mjs';

const baseAllowlist = {
  schemaVersion: 1,
  surfaces: {
    desktop: {
      intentional: [
        {
          pathPrefix: 'apps/desktop/src/lib/tauri-web/',
          reason: 'Web-build aliases swapped in only when isWebBuild is set in vite.config.ts.',
        },
      ],
      unreachableDebt: {
        reason: 'Pre-existing unreachable modules measured by the first import-graph walk.',
        trackedBy: 'SIX-32',
        paths: ['apps/desktop/src/api/index.ts'],
      },
    },
  },
};

test('a newly orphaned module fails because it is undeclared', () => {
  const result = analyzeSurface({
    unreachable: [
      'apps/desktop/src/api/index.ts',
      'apps/desktop/src/lib/tauri-web/core.ts',
      'apps/desktop/src/features/brand-new-orphan.ts',
    ],
    productFiles: [
      'apps/desktop/src/api/index.ts',
      'apps/desktop/src/lib/tauri-web/core.ts',
      'apps/desktop/src/features/brand-new-orphan.ts',
    ],
    surfaceAllowlist: baseAllowlist.surfaces.desktop,
  });

  assert.deepEqual(result.undeclared, ['apps/desktop/src/features/brand-new-orphan.ts']);
  assert.deepEqual(result.staleDebt, []);
  assert.deepEqual(result.staleIntentional, []);
});

test('declared debt passes, and stops passing once the module is wired up', () => {
  const clean = analyzeSurface({
    unreachable: ['apps/desktop/src/api/index.ts', 'apps/desktop/src/lib/tauri-web/core.ts'],
    productFiles: ['apps/desktop/src/api/index.ts', 'apps/desktop/src/lib/tauri-web/core.ts'],
    surfaceAllowlist: baseAllowlist.surfaces.desktop,
  });
  assert.deepEqual(clean.undeclared, []);
  assert.deepEqual(clean.staleDebt, []);

  // The debt entry became reachable: the ratchet must force its removal.
  const wired = analyzeSurface({
    unreachable: ['apps/desktop/src/lib/tauri-web/core.ts'],
    productFiles: ['apps/desktop/src/api/index.ts', 'apps/desktop/src/lib/tauri-web/core.ts'],
    surfaceAllowlist: baseAllowlist.surfaces.desktop,
  });
  assert.deepEqual(wired.staleDebt, [
    { path: 'apps/desktop/src/api/index.ts', why: 'now reachable' },
  ]);

  // The debt entry was deleted outright: also stale, with a different reason.
  const deleted = analyzeSurface({
    unreachable: ['apps/desktop/src/lib/tauri-web/core.ts'],
    productFiles: ['apps/desktop/src/lib/tauri-web/core.ts'],
    surfaceAllowlist: baseAllowlist.surfaces.desktop,
  });
  assert.deepEqual(deleted.staleDebt, [
    { path: 'apps/desktop/src/api/index.ts', why: 'no longer a product file' },
  ]);
});

test('an intentional exception that stops matching is reported as stale', () => {
  const result = analyzeSurface({
    unreachable: ['apps/desktop/src/api/index.ts'],
    productFiles: ['apps/desktop/src/api/index.ts'],
    surfaceAllowlist: baseAllowlist.surfaces.desktop,
  });
  assert.deepEqual(result.staleIntentional, ['apps/desktop/src/lib/tauri-web/']);
});

test('the allowlist schema rejects undocumented exceptions', () => {
  assert.throws(() => readAllowlist({ schemaVersion: 2, surfaces: {} }), /schemaVersion 1/);
  assert.throws(
    () =>
      readAllowlist({
        schemaVersion: 1,
        surfaces: { web: { intentional: [{ pathPrefix: 'a/', reason: 'too short' }] } },
      }),
    /at least 20 characters/,
  );
  assert.throws(
    () =>
      readAllowlist({
        schemaVersion: 1,
        surfaces: {
          web: { unreachableDebt: { reason: 'x'.repeat(30), trackedBy: '', paths: [] } },
        },
      }),
    /trackedBy/,
  );
  assert.throws(
    () =>
      readAllowlist({
        schemaVersion: 1,
        surfaces: {
          web: {
            unreachableDebt: { reason: 'x'.repeat(30), trackedBy: 'SIX-32', paths: ['a', 'a'] },
          },
        },
      }),
    /twice/,
  );
});

test('Chrome entry points come from the manifest, not from a directory sweep', () => {
  const entries = chromeManifestEntries(
    {
      background: { service_worker: 'src/background.js' },
      content_scripts: [{ js: ['src/content.js'] }],
      side_panel: { default_path: 'src/side_panel.html' },
      options_ui: { page: 'src/options.html' },
    },
    '/repo/apps/extension/src',
  );

  assert.deepEqual(
    entries.map((entry) => entry.replace(/^.*apps\/extension\//, '')),
    ['src/background.js', 'src/content.js', 'src/options.html', 'src/side_panel.html'],
  );
});

test('every shipping surface resolves at least one real entry point', () => {
  for (const surface of buildSurfaces()) {
    assert.ok(
      surface.entries.length > 0,
      `${surface.id} resolved no entry point; the walk would be vacuously green`,
    );
    assert.ok(surface.productRoots.length > 0, `${surface.id} declares no product roots`);
  }
});
