import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPABILITIES,
  CATALOG,
  FLAG_DEFINITION,
  KILL_SWITCHES,
  PIPELINE_CHANNELS,
  REGISTRY_MODULE,
  REGISTRY_PATH,
  RING_CHANNELS,
  checkFeatureMaturity,
  readRecordKeys,
} from './check-feature-maturity.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function governance(overrides = {}) {
  return {
    owner: 'apps/web/lib/owner.ts',
    exitCriteria: 'The install path succeeds twice in a row without an operator touching anything.',
    killSwitch: 'canUsePlugins',
    dataMigration: 'Rows carry the version that wrote them and removal archives rather than drops.',
    rolloutRing: 'plugins',
    support: 'Answered on the normal support queue, with a failed install treated as a defect.',
    userFacing: true,
    ...overrides,
  };
}

function fixture({ features, catalog, labels, denials, ringChannels, pipeline } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'feature-maturity-'));
  roots.push(root);
  write(
    root,
    CATALOG,
    catalog ??
      "export const FEATURE_MATURITIES = ['experimental', 'beta', 'general_availability'] as const;\n" +
        "export const RELEASE_CHANNELS = ['stable', 'beta', 'nightly'] as const;\n",
  );
  write(
    root,
    REGISTRY_MODULE,
    labels ??
      'export const FEATURE_MATURITY_LABELS = Object.freeze({\n' +
        "  experimental: 'Experimental',\n  beta: 'Beta',\n  general_availability: null,\n});\n",
  );
  write(
    root,
    FLAG_DEFINITION,
    denials ??
      'export const MATURITY_DENIAL_REASONS = {\n' +
        "  experimental: 'feature_experimental',\n  beta: 'feature_closed_beta',\n" +
        '  general_availability: null,\n};\n',
  );
  write(
    root,
    RING_CHANNELS,
    ringChannels ?? "export const RELEASE_CHANNELS = ['stable', 'beta', 'nightly'];\n",
  );
  write(
    root,
    PIPELINE_CHANNELS,
    pipeline ?? "export const RELEASE_CHANNELS = ['stable', 'beta', 'nightly'];\n",
  );
  write(root, CAPABILITIES, "export type PlatformCapability = | 'canUsePlugins' | 'canChat';\n");
  write(root, KILL_SWITCHES, "export const EXTRA_KILL_SWITCH_CAPABILITIES = ['work'] as const;\n");
  write(root, 'apps/web/lib/owner.ts', 'export const owner = true;\n');
  write(
    root,
    REGISTRY_PATH,
    JSON.stringify({
      features: features ?? {
        plugins: { label: 'Plugins', maturity: 'beta', governance: governance() },
        projects: { label: 'Projects', maturity: 'general_availability' },
      },
    }),
  );
  return root;
}

function errorsOf(options) {
  return checkFeatureMaturity(fixture(options)).errors;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a registry where every unfinished feature is governed passes', () => {
  const result = checkFeatureMaturity(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.features, 2);
  assert.equal(result.unfinished, 1);
});

test('an unfinished feature with no governance block fails', () => {
  const errors = errorsOf({ features: { plugins: { label: 'Plugins', maturity: 'beta' } } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /names no owner/);
});

test('an owner that is not a path in the repository fails', () => {
  const errors = errorsOf({
    features: {
      plugins: { maturity: 'beta', governance: governance({ owner: 'the plugins team' }) },
    },
  });
  assert.match(errors.join('\n'), /not a path in this repository/);
});

test('a rollback plan naming a switch no operator can flip fails', () => {
  const errors = errorsOf({
    features: {
      plugins: { maturity: 'beta', governance: governance({ killSwitch: 'canDoTheThing' }) },
    },
  });
  assert.match(errors.join('\n'), /not a switch an operator can flip/);
});

test('an extra kill switch outside the platform capabilities is accepted', () => {
  const errors = errorsOf({
    features: { plugins: { maturity: 'beta', governance: governance({ killSwitch: 'work' }) } },
  });
  assert.deepEqual(errors, []);
});

test('two unfinished features sharing one rollout ring fails', () => {
  const errors = errorsOf({
    features: {
      plugins: { maturity: 'beta', governance: governance() },
      hooks: { maturity: 'experimental', governance: governance() },
    },
  });
  assert.match(errors.join('\n'), /share the rollout ring/);
});

test('an empty exit criterion fails', () => {
  const errors = errorsOf({
    features: { plugins: { maturity: 'beta', governance: governance({ exitCriteria: 'soon' }) } },
  });
  assert.match(errors.join('\n'), /no usable exitCriteria/);
});

test('a user-facing feature at a maturity that resolves no label fails', () => {
  const errors = errorsOf({
    labels:
      'export const FEATURE_MATURITY_LABELS = Object.freeze({\n' +
      "  experimental: 'Experimental',\n  beta: null,\n  general_availability: null,\n});\n",
  });
  assert.match(errors.join('\n'), /resolves no label/);
});

test('a generally available feature carrying governance fails', () => {
  const errors = errorsOf({
    features: {
      projects: { maturity: 'general_availability', governance: governance() },
    },
  });
  assert.match(errors.join('\n'), /already exited/);
});

test('a maturity stage no table can answer for fails', () => {
  const errors = errorsOf({
    catalog:
      "export const FEATURE_MATURITIES = ['experimental', 'beta', 'sunset', 'general_availability'] as const;\n" +
      "export const RELEASE_CHANNELS = ['stable', 'beta', 'nightly'] as const;\n",
  });
  const joined = errors.join('\n');
  assert.match(joined, /FEATURE_MATURITY_LABELS has no entry for the "sunset" maturity/);
  assert.match(joined, /MATURITY_DENIAL_REASONS has no entry for the "sunset" maturity/);
});

test('a second channel vocabulary fails', () => {
  const errors = errorsOf({ pipeline: "export const RELEASE_CHANNELS = ['stable', 'canary'];\n" });
  assert.match(errors.join('\n'), /cannot be reconciled during an incident/);
});

test('record keys are read only at the top level', () => {
  const keys = readRecordKeys(
    'export const T = Object.freeze({\n  a: { nested: 1 },\n  b: 2,\n});\n',
    'T',
  );
  assert.deepEqual(keys, ['a', 'b']);
});
