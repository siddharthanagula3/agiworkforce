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

const HELPER_MODULE = 'contracts/handshake.ts';

const HEADERS = {
  surface: {
    value: 'x-agi-surface',
    symbol: 'SURFACE_REQUEST_HEADER',
    declaredIn: HELPER_MODULE,
    answers: 'which product surface is calling',
  },
  clientVersion: {
    value: 'x-agi-client-version',
    symbol: 'CLIENT_VERSION_HEADER',
    declaredIn: HELPER_MODULE,
    answers: 'which build of that surface the user is running',
  },
  apiVersion: {
    value: 'x-agi-api-version',
    symbol: 'API_VERSION_REQUEST_HEADER',
    declaredIn: HELPER_MODULE,
    answers: 'which shapes that build was written against',
  },
};

const HELPER_SOURCE =
  "export const SURFACE_REQUEST_HEADER = 'x-agi-surface';\n" +
  "export const CLIENT_VERSION_HEADER = 'x-agi-client-version';\n" +
  "export const API_VERSION_REQUEST_HEADER = 'x-agi-api-version';\n" +
  "export const API_VERSION_RESPONSE_HEADER = 'x-agi-api-version';\n" +
  "export const MINIMUM_API_VERSION_RESPONSE_HEADER = 'x-agi-api-version-minimum';\n" +
  "export const API_CONTRACT_VERSION = '2026-09-17';\n" +
  "export const MINIMUM_SUPPORTED_API_CONTRACT_VERSION = '2026-09-17';\n" +
  'export function clientHandshakeHeaders(build) {\n' +
  '  return {\n' +
  '    [SURFACE_REQUEST_HEADER]: build.surface,\n' +
  '    [CLIENT_VERSION_HEADER]: build.version,\n' +
  '    [API_VERSION_REQUEST_HEADER]: API_CONTRACT_VERSION,\n' +
  '  };\n' +
  '}\n';

const BUILDER_SOURCE =
  "import { clientHandshakeHeaders } from '../contracts/handshake';\n" +
  'export function platformRequestHeaders() {\n' +
  "  return clientHandshakeHeaders({ surface: 'probe', version: '1.2.3' });\n" +
  '}\n';

const CALLER_SOURCE =
  "import { platformRequestHeaders } from './platformHeaders';\n" +
  'export const headers = { ...platformRequestHeaders() };\n';

const RESPONSE_SOURCE =
  'import {\n' +
  '  API_CONTRACT_VERSION,\n' +
  '  API_VERSION_RESPONSE_HEADER,\n' +
  '  MINIMUM_API_VERSION_RESPONSE_HEADER,\n' +
  '  MINIMUM_SUPPORTED_API_CONTRACT_VERSION,\n' +
  "} from '../contracts/handshake';\n" +
  'export const advertise = {\n' +
  '  API_CONTRACT_VERSION,\n' +
  '  API_VERSION_RESPONSE_HEADER,\n' +
  '  MINIMUM_API_VERSION_RESPONSE_HEADER,\n' +
  '  MINIMUM_SUPPORTED_API_CONTRACT_VERSION,\n' +
  '};\n';

const GATEWAY_SOURCE =
  "import { MINIMUM_SUPPORTED_API_CONTRACT_VERSION } from '../contracts/handshake';\n" +
  'export const SERVER_VERSION_ADVERTISEMENT = { MINIMUM_SUPPORTED_API_CONTRACT_VERSION };\n';

const NEGOTIATION_SOURCE =
  "export const CLIENT_UPGRADE_STATES = ['current', 'upgrade_optional', 'upgrade_required', 'unsupported'] as const;\n" +
  'export function readClientCapabilityManifest() {}\n' +
  'export function resolveClientUpgrade() {}\n' +
  'export function degradeUnsupported() {}\n';

function clientFor(overrides = {}) {
  return {
    surface: 'probe',
    roots: ['client'],
    builder: {
      file: 'client/platformHeaders.ts',
      symbol: 'platformRequestHeaders',
      sets: ['surface', 'clientVersion', 'apiVersion'],
    },
    sends: ['surface', 'clientVersion', 'apiVersion'],
    defects: [],
    ...overrides,
  };
}

function contractFor(overrides = {}) {
  return {
    why: 'the handshake',
    headers: HEADERS,
    helper: { module: HELPER_MODULE, symbol: 'clientHandshakeHeaders' },
    clients: [clientFor()],
    server: {
      latest: { file: HELPER_MODULE, symbol: 'API_CONTRACT_VERSION' },
      advertisedOn: { file: 'server/responses.ts', symbol: 'API_VERSION_RESPONSE_HEADER' },
      minimumSupported: {
        file: HELPER_MODULE,
        symbol: 'MINIMUM_SUPPORTED_API_CONTRACT_VERSION',
        advertisedOn: 'MINIMUM_API_VERSION_RESPONSE_HEADER',
        refusesWith: 'CLIENT_UPDATE_REQUIRED',
      },
      refusal: { file: 'server/gateway.ts', symbol: 'SERVER_VERSION_ADVERTISEMENT' },
      defects: [],
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
  write(root, HELPER_MODULE, HELPER_SOURCE);
  write(root, 'contracts/negotiation.ts', NEGOTIATION_SOURCE);
  write(root, 'server/responses.ts', RESPONSE_SOURCE);
  write(root, 'server/gateway.ts', GATEWAY_SOURCE);
  write(root, 'client/platformHeaders.ts', BUILDER_SOURCE);
  write(root, 'client/api.ts', CALLER_SOURCE);
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  assert.deepEqual(checkClientHandshake(REPO_ROOT).errors, []);
});

test('the shipped contract records no outstanding omission', () => {
  const contract = loadContract(REPO_ROOT);
  const recorded = [
    ...contract.clients.flatMap((client) => (client.defects ?? []).map(() => client.surface)),
    ...(contract.server.defects ?? []).map(() => 'server'),
  ];
  assert.deepEqual(recorded, []);
});

test('the shipped contract describes every surface the vocabulary defines', () => {
  const described = loadContract(REPO_ROOT).clients.map((client) => client.surface);
  assert.deepEqual([...described].sort(), [...readSurfaces(REPO_ROOT)].sort());
});

test('every shipped surface names a builder that exists and a build to read its version from', () => {
  for (const client of loadContract(REPO_ROOT).clients) {
    assert.ok(client.builder?.file, client.surface);
    assert.ok(client.build?.file, client.surface);
  }
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

test('a surface no module takes part in the handshake for fails', () => {
  const root = fixture(contractFor(), {
    'client/api.ts': 'export const headers = {};\n',
    'client/platformHeaders.ts': 'export const nothing = {};\n',
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('no module under client takes part in the handshake')),
    errors.join('\n'),
  );
});

test('a request module that hand-rolls the surface header and skips the builder fails', () => {
  const root = fixture(contractFor(), {
    'client/upload.ts': "export const headers = { 'X-AGI-Surface': 'probe' };\n",
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('client/upload.ts neither sets it nor goes through')),
    errors.join('\n'),
  );
});

test('a builder that sets only part of the handshake leaves the rest to the caller', () => {
  const contract = contractFor({
    clients: [
      clientFor({
        builder: {
          file: 'client/platformHeaders.ts',
          symbol: 'platformRequestHeaders',
          sets: ['clientVersion', 'apiVersion'],
        },
      }),
    ],
  });
  const root = fixture(contract, {
    'client/platformHeaders.ts':
      "import { clientHandshakeHeaders } from '../contracts/handshake';\n" +
      'export function platformRequestHeaders() {\n' +
      "  return clientHandshakeHeaders({ surface: 'probe', version: '1.2.3' });\n" +
      '}\n',
    'client/api.ts':
      "import { platformRequestHeaders } from './platformHeaders';\n" +
      "export const headers = { 'X-AGI-Surface': 'probe', ...platformRequestHeaders() };\n",
    'client/upload.ts':
      "import { platformRequestHeaders } from './platformHeaders';\n" +
      'export const headers = { ...platformRequestHeaders() };\n',
  });
  assert.deepEqual(checkClientHandshake(root).errors, []);
});

test('a caller that names the surface itself and skips the builder still fails', () => {
  const contract = contractFor({
    clients: [
      clientFor({
        builder: {
          file: 'client/platformHeaders.ts',
          symbol: 'platformRequestHeaders',
          sets: ['clientVersion', 'apiVersion'],
        },
      }),
    ],
  });
  const root = fixture(contract, {
    'client/platformHeaders.ts':
      "import { clientHandshakeHeaders } from '../contracts/handshake';\n" +
      'export function platformRequestHeaders() {\n' +
      "  return clientHandshakeHeaders({ surface: 'probe', version: '1.2.3' });\n" +
      '}\n',
    'client/api.ts': "export const headers = { 'X-AGI-Surface': 'probe' };\n",
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('client/api.ts neither sets it nor goes through')),
    errors.join('\n'),
  );
});

test('a builder that only imports the shared helper and never calls it fails', () => {
  const root = fixture(contractFor(), {
    'client/platformHeaders.ts':
      "import { clientHandshakeHeaders } from '../contracts/handshake';\n" +
      'export function platformRequestHeaders() {\n' +
      "  return { 'x-agi-surface': 'probe' };\n" +
      '}\n',
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('sets no clientVersion header')),
    errors.join('\n'),
  );
});

test('a shared helper that declares a header and never attaches it fails', () => {
  const root = fixture(contractFor(), {
    [HELPER_MODULE]: HELPER_SOURCE.replace('    [CLIENT_VERSION_HEADER]: build.version,\n', ''),
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('attaches no clientVersion header')),
    errors.join('\n'),
  );
});

test('a surface that names no builder fails', () => {
  const contract = contractFor({ clients: [clientFor({ builder: undefined })] });
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('names no shared header builder')),
    errors.join('\n'),
  );
});

test('a missing header with no recorded defect fails', () => {
  const contract = contractFor({
    clients: [
      clientFor({
        sends: ['surface'],
        builder: {
          file: 'client/platformHeaders.ts',
          symbol: 'platformRequestHeaders',
          sets: ['surface'],
        },
      }),
    ],
  });
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('records no defect for it')),
    errors.join('\n'),
  );
});

test('a recorded defect the builder has since fixed is stale and fails', () => {
  const contract = contractFor({
    clients: [
      clientFor({
        sends: ['surface'],
        defects: [
          { header: 'clientVersion', fix: 'send it' },
          { header: 'apiVersion', fix: 'send it' },
        ],
      }),
    ],
  });
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('the clientVersion defect is stale')),
    errors.join('\n'),
  );
});

test('a defect with no fix fails', () => {
  const contract = contractFor({
    clients: [
      clientFor({
        sends: ['surface'],
        builder: {
          file: 'client/platformHeaders.ts',
          symbol: 'platformRequestHeaders',
          sets: ['surface'],
        },
        defects: [{ header: 'clientVersion' }, { header: 'apiVersion', fix: 'send it' }],
      }),
    ],
  });
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('the clientVersion defect names no fix')),
    errors.join('\n'),
  );
});

test('a header constant whose value drifted from the contract fails', () => {
  const root = fixture(contractFor(), {
    [HELPER_MODULE]: HELPER_SOURCE.replace(
      "export const SURFACE_REQUEST_HEADER = 'x-agi-surface';",
      "export const SURFACE_REQUEST_HEADER = 'x-agi-origin';",
    ),
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

test('a floor no response carries fails', () => {
  const root = fixture(contractFor(), {
    'server/responses.ts':
      "import { API_CONTRACT_VERSION, API_VERSION_RESPONSE_HEADER } from '../contracts/handshake';\n" +
      'export const advertise = { API_CONTRACT_VERSION, API_VERSION_RESPONSE_HEADER };\n',
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('does not send MINIMUM_API_VERSION_RESPONSE_HEADER')),
    errors.join('\n'),
  );
});

test('a floor nothing refuses below fails', () => {
  const root = fixture(contractFor(), { 'server/gateway.ts': 'export const nothing = {};\n' });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('does not name SERVER_VERSION_ADVERTISEMENT')),
    errors.join('\n'),
  );
});

test('a floor newer than the contract the server serves fails', () => {
  const root = fixture(contractFor(), {
    [HELPER_MODULE]: HELPER_SOURCE.replace(
      "export const MINIMUM_SUPPORTED_API_CONTRACT_VERSION = '2026-09-17';",
      "export const MINIMUM_SUPPORTED_API_CONTRACT_VERSION = '2027-01-01';",
    ),
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('is newer than the contract')),
    errors.join('\n'),
  );
});

test('no floor and no recorded defect fails', () => {
  const contract = contractFor();
  contract.server.minimumSupported = null;
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('advertises no minimum supported contract')),
    errors.join('\n'),
  );
});

test('an advertised floor and a defect for the same claim cannot both stand', () => {
  const contract = contractFor();
  contract.server.defects = [{ claim: 'minimumSupported', fix: 'export the floor and send it' }];
  const { errors } = checkClientHandshake(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('records it as a defect at the same time')),
    errors.join('\n'),
  );
});

test('a mirrored contract version that drifted from the served one fails', () => {
  const contract = contractFor({
    mirror: {
      file: 'client/handshake.rs',
      headerConstants: {
        surface: 'SURFACE_HEADER',
        clientVersion: 'CLIENT_VERSION_HEADER',
        apiVersion: 'API_VERSION_HEADER',
      },
      versionConstant: 'API_CONTRACT_VERSION',
    },
  });
  const root = fixture(contract, {
    'client/handshake.rs':
      'pub const SURFACE_HEADER: &str = "x-agi-surface";\n' +
      'pub const CLIENT_VERSION_HEADER: &str = "x-agi-client-version";\n' +
      'pub const API_VERSION_HEADER: &str = "x-agi-api-version";\n' +
      'pub const API_CONTRACT_VERSION: &str = "2025-01-01";\n',
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('claims contract 2025-01-01')),
    errors.join('\n'),
  );
});

test('a mirrored header name that drifted from the contract fails', () => {
  const contract = contractFor({
    mirror: {
      file: 'client/handshake.rs',
      headerConstants: { surface: 'SURFACE_HEADER' },
      versionConstant: 'API_CONTRACT_VERSION',
    },
  });
  const root = fixture(contract, {
    'client/handshake.rs':
      'pub const SURFACE_HEADER: &str = "x-agi-origin";\n' +
      'pub const API_CONTRACT_VERSION: &str = "2026-09-17";\n',
  });
  const { errors } = checkClientHandshake(root);
  assert.ok(
    errors.some((error) => error.includes('SURFACE_HEADER is "x-agi-origin"')),
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
