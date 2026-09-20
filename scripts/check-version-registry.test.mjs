import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { REGISTRY_MODULE, REGISTRY_PATH, checkVersionRegistry } from './check-version-registry.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function fixture({ registry, carrier, moduleSource } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'version-registry-'));
  roots.push(root);
  write(
    root,
    REGISTRY_MODULE,
    moduleSource ??
      `export const VERSIONED_ARTIFACTS = ['tool-schema', 'database-schema'] as const;\n`,
  );
  write(
    root,
    'packages/contracts/types/src/tool-primitive.ts',
    carrier ?? 'export const TOOL_SCHEMA_VERSION = 1;\nexport const TOOL_MIN_SCHEMA_VERSION = 1;\n',
  );
  write(root, 'apps/web/db/neon/0001_init.sql', 'create table public.a (id text);\n');
  write(
    root,
    REGISTRY_PATH,
    JSON.stringify(
      registry ?? {
        artifacts: {
          'tool-schema': {
            why: 'a stored tool call outlives its build',
            kind: 'constant',
            file: 'packages/contracts/types/src/tool-primitive.ts',
            symbol: 'TOOL_SCHEMA_VERSION',
            minSymbol: 'TOOL_MIN_SCHEMA_VERSION',
            negotiated: false,
          },
          'database-schema': {
            why: 'the stored shape',
            kind: 'migrationSequence',
            path: 'apps/web/db/neon',
            negotiated: false,
          },
        },
        clientFloor: {
          why: 'the oldest runtime the server answers',
          file: 'packages/contracts/types/src/floor.ts',
          symbol: 'MINIMUM_SUPPORTED_RUNTIME_VERSION',
          unsupportedCode: 'PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE',
        },
      },
    ),
  );
  write(
    root,
    'packages/contracts/types/src/floor.ts',
    `export const MINIMUM_SUPPORTED_RUNTIME_VERSION = '1.7.1';\nexport const PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE = -32005;\n`,
  );
  return root;
}

const run = (root) => checkVersionRegistry(root).errors.join('\n');

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a registry whose carriers all resolve passes', () => {
  assert.equal(run(fixture()), '');
});

test('a renamed version constant fails', () => {
  assert.match(
    run(fixture({ carrier: 'export const TOOL_ENVELOPE_VERSION = 1;\n' })),
    /names TOOL_SCHEMA_VERSION in .*tool-primitive\.ts, which no longer carries it/,
  );
});

test('a missing floor on a constant that declares one fails', () => {
  assert.match(
    run(fixture({ carrier: 'export const TOOL_SCHEMA_VERSION = 1;\n' })),
    /names a floor TOOL_MIN_SCHEMA_VERSION/,
  );
});

test('an artifact the type cannot name fails', () => {
  assert.match(
    run(
      fixture({ moduleSource: `export const VERSIONED_ARTIFACTS = ['tool-schema'] as const;\n` }),
    ),
    /VERSIONED_ARTIFACTS omits "database-schema"/,
  );
});

test('an artifact with no carrier fails', () => {
  const root = fixture({
    moduleSource: `export const VERSIONED_ARTIFACTS = ['tool-schema', 'database-schema', 'skill-manifest'] as const;\n`,
  });
  assert.match(run(root), /"skill-manifest" is declared in the type and names no carrier/);
});

test('taking a version from a package manifest fails', () => {
  const root = fixture({
    registry: {
      artifacts: {
        'tool-schema': {
          why: 'a stored tool call outlives its build',
          kind: 'constant',
          file: 'packages/contracts/types/package.json',
          symbol: 'version',
          negotiated: false,
        },
        'database-schema': {
          why: 'the stored shape',
          kind: 'migrationSequence',
          path: 'apps/web/db/neon',
          negotiated: false,
        },
      },
      clientFloor: {
        why: 'the oldest runtime',
        file: 'packages/contracts/types/src/floor.ts',
        symbol: 'MINIMUM_SUPPORTED_RUNTIME_VERSION',
        unsupportedCode: 'PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE',
      },
    },
  });
  write(root, 'packages/contracts/types/package.json', '{"version": "0.0.1"}');
  assert.match(run(root), /takes its version from a package manifest/);
});

test('a run-time artifact with no floor fails', () => {
  const root = fixture({
    registry: {
      artifacts: {
        'tool-schema': {
          why: 'exchanged at run time',
          kind: 'constant',
          file: 'packages/contracts/types/src/tool-primitive.ts',
          symbol: 'TOOL_SCHEMA_VERSION',
          negotiated: true,
        },
        'database-schema': {
          why: 'the stored shape',
          kind: 'migrationSequence',
          path: 'apps/web/db/neon',
          negotiated: false,
        },
      },
      clientFloor: {
        why: 'the oldest runtime',
        file: 'packages/contracts/types/src/floor.ts',
        symbol: 'MINIMUM_SUPPORTED_RUNTIME_VERSION',
        unsupportedCode: 'PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE',
      },
    },
    carrier: 'export const TOOL_SCHEMA_VERSION = 1;\n',
  });
  assert.match(run(root), /declares no floor/);
});

test('losing the way to refuse an old client fails', () => {
  const root = fixture();
  write(root, 'packages/contracts/types/src/floor.ts', `export const OTHER = 1;\n`);
  const report = run(root);
  assert.match(report, /names MINIMUM_SUPPORTED_RUNTIME_VERSION/);
  assert.match(report, /names PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE/);
});

test('a database schema with no migration fails', () => {
  const root = fixture();
  rmSync(path.join(root, 'apps/web/db/neon/0001_init.sql'));
  assert.match(run(root), /holds no numbered migration/);
});
