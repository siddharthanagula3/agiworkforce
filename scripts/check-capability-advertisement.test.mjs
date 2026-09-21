import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CAPABILITY_SOURCE,
  DEVICE_REGISTRY_SOURCE,
  GAPS_PATH,
  HANDSHAKE_CONTRACT,
  REPO_ROOT,
  collectViolations,
  deviceScopedCapabilities,
  readAdvertisedFields,
  readRequestFields,
} from './check-capability-advertisement.mjs';

import { readFileSync } from 'node:fs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const CAPABILITIES = `
export type PlatformCapability =
  | 'canChat'
  | 'canUseTerminal'
  | 'canUseLocalMcp';

const WEB: CapabilityRow = {
  canChat: true,
  canUseTerminal: false,
  canUseLocalMcp: false,
};

const DESKTOP: CapabilityRow = {
  canChat: true,
  canUseTerminal: true,
  canUseLocalMcp: true,
};

const MOBILE: CapabilityRow = {
  canChat: true,
  canUseTerminal: false,
  canUseLocalMcp: false,
};
`;

function deviceRegistry({ fields = ['localMcp'], identity = true } = {}) {
  const capabilityFields = fields.map((field) => `    ${field}: z.boolean().default(false),`);
  const identityFields = identity
    ? [
        '    surface: z.enum(DEVICE_SURFACES),',
        '    installId: z.string(),',
        '    os: z.enum(DEVICE_OPERATING_SYSTEMS),',
        '    architecture: z.enum(DEVICE_ARCHITECTURES).optional(),',
        '    appVersion: z.string().optional(),',
        '    shell: z.string().optional(),',
      ]
    : ['    surface: z.enum(DEVICE_SURFACES),'];
  return [
    'export const DeviceCapabilitiesSchema = z',
    '  .object({',
    ...capabilityFields,
    '  })',
    '  .strict();',
    '',
    'export const DeviceHeartbeatRequestSchema = z',
    '  .object({',
    ...identityFields,
    '    capabilities: DeviceCapabilitiesSchema,',
    '  })',
    '  .strict();',
    '',
  ].join('\n');
}

function gapsFile(overrides = {}) {
  return JSON.stringify(
    {
      why: 'test',
      advertises: { canUseLocalMcp: 'localMcp' },
      gaps: {
        canUseTerminal: {
          field: 'terminal',
          owner: 'packages/contracts/cloud-contracts/src/device-registry.ts',
          why: 'The schema has no terminal field.',
        },
      },
      ...overrides,
    },
    null,
    2,
  );
}

function scaffold({
  capabilities = CAPABILITIES,
  registry = deviceRegistry(),
  gaps = gapsFile(),
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'capability-advert-'));
  roots.push(root);
  write(root, CAPABILITY_SOURCE, capabilities);
  write(root, DEVICE_REGISTRY_SOURCE, registry);
  write(root, GAPS_PATH, gaps);
  write(
    root,
    HANDSHAKE_CONTRACT,
    JSON.stringify({ clients: [{ surface: 'web', builder: { file: 'a.ts' } }] }, null, 2),
  );
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a device that advertises or records every capability passes', () => {
  assert.deepEqual(collectViolations(scaffold()), []);
});

test('a device capability that is neither advertised nor recorded fails', () => {
  const violations = collectViolations(scaffold({ gaps: gapsFile({ gaps: {} }) }));
  assert.equal(violations.length, 1);
  assert.match(violations[0], /canUseTerminal/);
  assert.match(violations[0], /infer it from the surface name/);
});

test('a capability claimed as advertised with no field in the schema fails', () => {
  const violations = collectViolations(
    scaffold({
      gaps: gapsFile({
        advertises: { canUseLocalMcp: 'localMcp', canUseTerminal: 'terminal' },
        gaps: {},
      }),
    }),
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /The schema is strict/);
});

test('a gap whose field has since been added fails rather than lingering', () => {
  const violations = collectViolations(
    scaffold({ registry: deviceRegistry({ fields: ['localMcp', 'terminal'] }) }),
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0], /Move it to "advertises"/);
});

test('a gap with no reason fails', () => {
  const violations = collectViolations(
    scaffold({
      gaps: gapsFile({
        gaps: {
          canUseTerminal: { owner: 'packages/contracts/cloud-contracts/src/device-registry.ts' },
        },
      }),
    }),
  );
  assert.ok(violations.some((violation) => /carries no reason/.test(violation)));
});

test('losing an identity field from the heartbeat fails', () => {
  const violations = collectViolations(scaffold({ registry: deviceRegistry({ identity: false }) }));
  assert.ok(violations.some((violation) => /no longer carries "appVersion"/.test(violation)));
});

test('a capability listed here that the matrix does not declare fails', () => {
  const violations = collectViolations(
    scaffold({ gaps: gapsFile({ advertises: { canUseLocalMcp: 'localMcp', canUseFax: 'fax' } }) }),
  );
  assert.ok(violations.some((violation) => /canUseFax/.test(violation)));
});

test('the real tree parses, so the guard measures something', () => {
  const capabilities = readFileSync(path.join(REPO_ROOT, CAPABILITY_SOURCE), 'utf8');
  const registry = readFileSync(path.join(REPO_ROOT, DEVICE_REGISTRY_SOURCE), 'utf8');
  assert.ok(deviceScopedCapabilities(capabilities).includes('canUseTerminal'));
  assert.ok(readAdvertisedFields(registry).includes('localMcp'));
  assert.ok(readRequestFields(registry).includes('appVersion'));
});
