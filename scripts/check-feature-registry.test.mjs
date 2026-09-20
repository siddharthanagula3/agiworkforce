import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DOMAIN_REGISTRY,
  LAYER_VOCABULARIES,
  MATURITY_VOCABULARY,
  REGISTRY_MODULE,
  REGISTRY_PATH,
  checkFeatureRegistry,
  findLabelComparisons,
} from './check-feature-registry.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function feature(overrides = {}) {
  return {
    label: 'Computer use',
    domain: 'computer-use',
    maturity: 'beta',
    dependsOn: [],
    incompatibleWith: [],
    requiresHost: null,
    minClientVersion: null,
    minBackendVersion: null,
    gates: {
      entitlement: 'agi_work',
      policy: 'computer_use',
      permission: null,
      trustBoundary: 'device',
      rolloutFlag: null,
    },
    ...overrides,
  };
}

function fixture(features = { computer_use: feature() }) {
  const root = mkdtempSync(path.join(tmpdir(), 'feature-registry-'));
  roots.push(root);
  write(root, REGISTRY_PATH, JSON.stringify({ features }));
  write(root, REGISTRY_MODULE, 'const x = registryJson.features;\n');
  write(
    root,
    LAYER_VOCABULARIES.entitlement.file,
    `export type BillingPlanCapability = | 'agi_work' | 'projects';\n`,
  );
  write(
    root,
    LAYER_VOCABULARIES.policy.file,
    `export const WORKSPACE_FEATURES = ['computer_use'] as const;\n`,
  );
  write(
    root,
    LAYER_VOCABULARIES.permission.file,
    `export const ADMIN_PERMISSION_AREAS = ['policy'] as const;\n`,
  );
  write(
    root,
    LAYER_VOCABULARIES.trustBoundary.file,
    `export const STORAGE_LOCATIONS = ['device', 'managed-cloud'] as const;\n`,
  );
  write(root, LAYER_VOCABULARIES.rolloutFlag.file, `const FLAGS = ['routing.canary'];\n`);
  write(
    root,
    MATURITY_VOCABULARY.file,
    `export const FEATURE_MATURITIES = ['experimental', 'beta', 'general_availability'] as const;\n`,
  );
  write(
    root,
    DOMAIN_REGISTRY,
    JSON.stringify({ domains: [{ name: 'computer-use' }, { name: 'projects' }] }),
  );
  write(
    root,
    'packages/contracts/types/src/developer-session-versioning.ts',
    `export const MINIMUM_SUPPORTED_RUNTIME_VERSION = '1.7.1';\n`,
  );
  write(root, 'apps/web/lib/api-gateway-policy.ts', `export const API_CONTRACT_VERSION = 'x';\n`);
  spawnSync('git', ['-C', root, 'init', '-q'], { encoding: 'utf8' });
  return root;
}

const run = (root) => checkFeatureRegistry(root).errors.join('\n');

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a registry whose gates all resolve passes', () => {
  assert.equal(run(fixture()), '');
});

test('a policy key used as an entitlement fails', () => {
  const root = fixture({
    computer_use: feature({
      gates: {
        entitlement: 'computer_use',
        policy: 'computer_use',
        permission: null,
        trustBoundary: null,
        rolloutFlag: null,
      },
    }),
  });
  assert.match(run(root), /gates entitlement on "computer_use", which is a policy key/);
});

test('an entitlement key used as a policy fails', () => {
  const root = fixture({
    computer_use: feature({
      gates: {
        entitlement: 'agi_work',
        policy: 'agi_work',
        permission: null,
        trustBoundary: null,
        rolloutFlag: null,
      },
    }),
  });
  assert.match(run(root), /gates policy on "agi_work", which is a entitlement key/);
});

test('a feature gated only by a rollout flag fails', () => {
  const root = fixture({
    computer_use: feature({
      gates: {
        entitlement: null,
        policy: null,
        permission: null,
        trustBoundary: null,
        rolloutFlag: 'routing.canary',
      },
    }),
  });
  const report = run(root);
  assert.match(report, /gated only by a rollout flag/);
});

test('a feature no layer gates fails', () => {
  const root = fixture({
    computer_use: feature({
      gates: {
        entitlement: null,
        policy: null,
        permission: null,
        trustBoundary: 'device',
        rolloutFlag: null,
      },
    }),
  });
  assert.match(run(root), /gated by no entitlement, policy or permission/);
});

test('an unowned domain, an invented maturity and a missing dependency fail', () => {
  const root = fixture({
    computer_use: feature({ domain: 'holodeck', maturity: 'gamma', dependsOn: ['telepathy'] }),
  });
  const report = run(root);
  assert.match(report, /which is not a product domain/);
  assert.match(report, /claims maturity "gamma"/);
  assert.match(report, /depends on "telepathy", which is not a feature/);
});

test('a one-sided incompatibility fails', () => {
  const root = fixture({
    computer_use: feature({ incompatibleWith: ['projects'] }),
    projects: feature({
      label: 'Projects',
      domain: 'projects',
      gates: {
        entitlement: 'projects',
        policy: null,
        permission: null,
        trustBoundary: null,
        rolloutFlag: null,
      },
    }),
  });
  assert.match(run(root), /does not refuse "computer_use"/);
});

test('a host requirement with no floor fails, and a floor with no host requirement fails', () => {
  assert.match(
    run(fixture({ computer_use: feature({ requiresHost: 'desktop' }) })),
    /needs desktop and records no minClientVersion/,
  );
  assert.match(
    run(
      fixture({ computer_use: feature({ minClientVersion: 'MINIMUM_SUPPORTED_RUNTIME_VERSION' }) }),
    ),
    /needs no host and records a minClientVersion/,
  );
});

test('a version floor copied as a literal rather than named fails', () => {
  const root = fixture({
    computer_use: feature({
      requiresHost: 'desktop',
      minClientVersion: '1.7.1',
      minBackendVersion: 'API_CONTRACT_VERSION',
    }),
  });
  assert.match(run(root), /records minClientVersion "1\.7\.1", which is not a version symbol/);
});

test('a governed feature the registry does not define fails', () => {
  const root = fixture({});
  assert.match(run(root), /the workspace controls govern "computer_use" and the registry does not/);
});

test('resolving a feature by its display name is found, and only where features are resolved', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'feature-label-'));
  roots.push(root);
  write(
    root,
    'apps/web/features/a.ts',
    `import type { WorkspaceFeature } from '@agiworkforce/types';\n` +
      `export const on = (label: string): WorkspaceFeature | null => (label === 'Computer use' ? 'computer_use' : null);\n`,
  );
  write(root, 'apps/web/features/b.tsx', `const tab = name === 'Computer use' ? 1 : 0;\n`);
  const violations = findLabelComparisons({
    repoRoot: root,
    files: ['apps/web/features/a.ts', 'apps/web/features/b.tsx'],
    labels: ['Computer use'],
  });
  assert.deepEqual(
    violations.map((violation) => violation.file),
    ['apps/web/features/a.ts'],
  );
});
