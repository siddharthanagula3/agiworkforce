import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readRegistry, stripComments } from './check-connector-credential-containment.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-connector-credential-containment.mjs',
);

const REGISTRY = `
export const CONNECTOR_SECRET_PURPOSES = [
  'custom-connector-auth-header',
  'oauth-access-token',
] as const;

export const CONNECTOR_SECRET_COLUMNS: readonly ConnectorSecretColumn[] = [
  {
    table: 'public.user_custom_connectors',
    column: 'auth_header_enc',
    keyColumn: 'id',
    purpose: 'custom-connector-auth-header',
  },
  {
    table: 'public.connector_oauth_grants',
    column: 'access_token_enc',
    keyColumn: 'id',
    purpose: 'oauth-access-token',
  },
];
`;

const BROKER = `import 'server-only';

export function open(sealed: string) {
  const header = openCustomConnectorCredential(sealed);
  const token = decryptConnectorToken(sealed, 'oauth-access-token');
  return { header, token, purpose: 'custom-connector-auth-header' };
}

export async function read(db: Db, userId: string) {
  return db.query('select access_token_enc from connector_oauth_grants where user_id = $1', [
    userId,
  ]);
}
`;

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-containment-'));
  const all = { 'apps/web/lib/crypto/connector-secret-reseal.ts': REGISTRY, ...files };
  for (const [relative, contents] of Object.entries(all)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  try {
    execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a server-only broker module that opens credentials passes', () => {
  assert.equal(tree({ 'apps/web/lib/connectors/broker.ts': BROKER }).ok, true);
});

test('a route handler that opens a credential fails', () => {
  const result = tree({
    'apps/web/lib/connectors/broker.ts': BROKER,
    'apps/web/app/api/connectors/leak/route.ts': `export async function GET() {
  return Response.json({ token: decryptConnectorToken(row, 'oauth-access-token') });
}
`,
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /opens a connector credential outside the broker/u);
});

test('a route handler that selects a sealed column fails', () => {
  const result = tree({
    'apps/web/lib/connectors/broker.ts': BROKER,
    'apps/web/app/api/user/export/route.ts': `export async function GET(db: Db) {
  return db.query('select auth_header_enc from user_custom_connectors');
}
`,
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /reads the sealed credential column auth_header_enc/u);
});

test('naming a withheld column in a comment stays legal', () => {
  const result = tree({
    'apps/web/lib/connectors/broker.ts': BROKER,
    'apps/web/app/api/user/export/route.ts': `export async function GET(db: Db) {
  // auth_header_enc is withheld: it is the credential the connector authenticates with.
  return db.query('select id from user_custom_connectors');
}
`,
  });
  assert.equal(result.ok, true);
});

test('a broker module that opens a credential without server-only fails', () => {
  const result = tree({
    'apps/web/lib/connectors/broker.ts': BROKER.replace("import 'server-only';\n", ''),
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /without importing server-only/u);
});

test('a purpose no module names fails rather than passing unserved', () => {
  const result = tree({
    'apps/web/lib/connectors/broker.ts': BROKER.replace(
      "purpose: 'custom-connector-auth-header'",
      "purpose: 'unused'",
    ),
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /is named by no module in the tree/u);
});

test('a tree where nothing opens a credential fails rather than reporting clean', () => {
  const result = tree({ 'apps/web/lib/connectors/nothing.ts': "import 'server-only';\n" });
  assert.equal(result.ok, false);
  assert.match(result.output, /the walk is measuring nothing/u);
});

test('comment stripping keeps a protocol-relative string intact', () => {
  const stripped = stripComments("const u = 'https://example.com'; // access_token_enc\n");
  assert.match(stripped, /https:\/\/example\.com/u);
  assert.doesNotMatch(stripped, /access_token_enc/u);
});

test('the registry is read from the module the re-seal walks', () => {
  const parsed = readRegistry(REGISTRY);
  assert.deepEqual(parsed.purposes, ['custom-connector-auth-header', 'oauth-access-token']);
  assert.deepEqual(
    parsed.columns.map((entry) => entry.column),
    ['auth_header_enc', 'access_token_enc'],
  );
});
