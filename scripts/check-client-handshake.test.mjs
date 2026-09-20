import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  SURFACE_VOCABULARY_PATH,
  checkClientHandshake,
  loadContract,
  readSurfaces,
} from './check-client-handshake.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const HEADERS = {
  surface: {
    value: 'x-agi-surface',
    symbol: 'SURFACE_REQUEST_HEADER',
    declaredIn: 'server/headers.ts',
    answers: 'which product surface is calling',
  },
  clientVersion: {
    value: 'x-agi-client-version',
    symbol: 'CLIENT_VERSION_HEADER',
    declaredIn: 'server/headers.ts',
    answers: 'which build of that surface the user is running',
  },
  apiVersion: {
    value: 'x-agi-api-version',
    symbol: 'API_VERSION_REQUEST_HEADER',
    declaredIn: 'server/headers.ts',
    answers: 'which shapes that build was written against',
  },
};

const HEADER_SOURCE =
  "export const SURFACE_REQUEST_HEADER = 'x-agi-surface';\n" +
  "export const CLIENT_VERSION_HEADER = 'x-agi-client-version';\n" +
  "export const API_VERSION_REQUEST_HEADER = 'x-agi-api-version';\n" +
  "export const API_CONTRACT_VERSION = '2026-09-17';\n" +
  "export const API_VERSION_RESPONSE_HEADER = 'x-agi-api-version';\n";

const NEGOTIATION_SOURCE =
  "export const CLIENT_UPGRADE_STATES = ['current', 'upgrade_optional', 'upgrade_required', 'unsupported'] as const;\n" +
  'export function readClientCapabilityManifest() {}\n' +
  'export function resolveClientUpgrade() {}\n' +
  'export function degradeUnsupported() {}\n';

function contractFor(overrides = {}) {
  return {
    why: 'the handshake',
    headers: HEADERS,
    clients: [
      {
        surface: 'probe',
        roots: ['client'],
        sends: ['surface', 'clientVersion', 'apiVersion'],
        defects: [],
      },
    ],
    server: {
      latest: { file: 'server/headers.ts', symbol: 'API_CONTRACT_VERSION' },
      advertisedOn: { file: 'server/responses.ts', symbol: 'API_VERSION_RESPONSE_HEADER' },
      minimumSupported: null,
      defects: [{ claim: 'minimumSupported', fix: 'export the floor and send it' }],
    },
    negotiation: {
      module: 'contracts/negotiation.ts',
      statesSymbol: 'CLIENT_UPGRADE_STATES',
      requiredStates: ['current', 'upgrade_optional', 'upgrade_required', 'unsupported'],
      unknownHandlers: [
        'readClientCapabilityManifest',
        'resolveClientUpgrade',
        'degradeUnsupported',
      ],
    },
    ...overrides,
  };
}

function fixture(contract = contractFor(), files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'client-handshake-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, CONTRACT_PATH, JSON.stringify(contract));
  write(root, SURFACE_VOCABULARY_PATH, "export type SourceSurface = 'probe';\n");
  write(root, 'server/headers.ts', HEADER_SOURCE);
  write(
    root,
    'server/responses.ts',
    "import { API_CONTRACT_VERSION, API_VERSION_RESPONSE_HEADER } from './headers';\n" +
      'export const advertise = { API_CONTRACT_VERSION, API_VERSION_RESPONSE_HEADER };\n',
  );
  write(root, 'contracts/negotiation.ts', NEGOTIATION_SOURCE);
  write(
    root,
    'client/api.ts',
    "export const headers = { 'X-AGI-Surface': 'probe', 'x-agi-client-version': '1', 'x-agi-api-version': '2026-09-17' };\n",
  );
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  assert.deepEqual(checkClientHandshake(REPO_ROOT).errors, []);
});

test('the shipped contract describes every surface the vocabulary defines', () => {
  const described = loadContract(REPO_ROOT).clients.map((client) => client.surface);
  assert.deepEqual([...described].sort(), [...readSurfaces(REPO_ROOT)].sort());
});

test('a clean surface passes', () => {
  assert.deepEqual(checkClientHandshake(fixture()).errors, []);
});

test('a surface the vocabulary defines and the contract omits fails', () => {
  const root = fixture(contractFor({ clients: [] }));
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('surface "probe" reaches the API')),
    errors.join('\n'),
  );
});

test('a surface that sets no surface header at all fails', () => {
  const root = fixture(contractFor(), { 'client/api.ts': 'export const headers = {};\n' });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('no module under client sets the surface header')),
    errors.join('\n'),
  );
});

test('a second request builder that omits a header the surface claims to send fails', () => {
  const contract = contractFor({
    clients: [
      { surface: 'probe', roots: ['client'], sends: ['surface', 'clientVersion'], defects: [] },
    ],
  });
  const root = fixture(contract, {
    'client/api.ts':
      "export const headers = { 'X-AGI-Surface': 'probe', 'x-agi-client-version': '1' };\n",
    'client/upload.ts': "export const headers = { 'X-AGI-Surface': 'probe' };\n",
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('client/upload.ts does not')),
    errors.join('\n'),
  );
});

test('a missing header with no recorded defect fails', () => {
  const contract = contractFor({
    clients: [{ surface: 'probe', roots: ['client'], sends: ['surface'], defects: [] }],
  });
  const { errors } = checkClientHandshake(
    fixture(contract, {
      'client/api.ts': "export const headers = { 'X-AGI-Surface': 'probe' };\n",
    }),
  );
  assert.ok(
    errors.some((error) => error.includes('records no defect for it')),
    errors.join('\n'),
  );
});

test('a recorded defect every builder has since fixed is stale and fails', () => {
  const contract = contractFor({
    clients: [
      {
        surface: 'probe',
        roots: ['client'],
        sends: ['surface'],
        defects: [
          { header: 'clientVersion', fix: 'send it' },
          { header: 'apiVersion', fix: 'send it' },
        ],
      },
    ],
  });
  const root = fixture(contract, {
    'client/api.ts':
      "export const headers = { 'X-AGI-Surface': 'probe', 'x-agi-client-version': '1' };\n",
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('the clientVersion defect is stale')),
    errors.join('\n'),
  );
});

test('a defect with no fix fails', () => {
  const contract = contractFor({
    clients: [
      {
        surface: 'probe',
        roots: ['client'],
        sends: ['surface'],
        defects: [{ header: 'clientVersion' }, { header: 'apiVersion', fix: 'send it' }],
      },
    ],
  });
  const { errors } = checkClientHandshake(
    fixture(contract, {
      'client/api.ts': "export const headers = { 'X-AGI-Surface': 'probe' };\n",
    }),
  );
  assert.ok(
    errors.some((error) => error.includes('the clientVersion defect names no fix')),
    errors.join('\n'),
  );
});

test('a header constant whose value drifted from the contract fails', () => {
  const root = fixture(contractFor(), {
    'server/headers.ts': HEADER_SOURCE.replace("'x-agi-surface'", "'x-agi-origin'"),
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('SURFACE_REQUEST_HEADER is "x-agi-origin"')),
    errors.join('\n'),
  );
});

test('a response that names no contract version fails', () => {
  const root = fixture(contractFor(), {
    'server/responses.ts': 'export const advertise = {};\n',
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('a response carries no version')),
    errors.join('\n'),
  );
});

test('an advertised floor and a defect for the same claim cannot both stand', () => {
  const contract = contractFor();
  contract.server.minimumSupported = {
    file: 'server/headers.ts',
    symbol: 'API_CONTRACT_VERSION',
  };
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('records it as a defect at the same time')),
    errors.join('\n'),
  );
});

test('a missing upgrade state fails', () => {
  const root = fixture(contractFor(), {
    'contracts/negotiation.ts': NEGOTIATION_SOURCE.replace(", 'unsupported'", ''),
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('omits "unsupported"')),
    errors.join('\n'),
  );
});

test('a negotiation module that stops exporting a handler fails', () => {
  const root = fixture(contractFor(), {
    'contracts/negotiation.ts': NEGOTIATION_SOURCE.replace(
      'export function degradeUnsupported() {}\n',
      '',
    ),
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('no longer exports degradeUnsupported')),
    errors.join('\n'),
  );
});
