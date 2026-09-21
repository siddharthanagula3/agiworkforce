import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { declaredColumns, declaredPurposes } from './check-connector-secret-reseal.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-connector-secret-reseal.mjs',
);

const MODULE = 'apps/web/lib/crypto/connector-secret-reseal.ts';
const MIGRATION = 'apps/web/db/neon/0001_connectors.sql';

const SCHEMA = `
create table if not exists public.user_custom_connectors (
  id uuid primary key,
  auth_header_enc text
);
create table if not exists public.connector_oauth_grants (
  id uuid primary key,
  access_token_enc text
);
`;

function moduleSource({ purposes, columns }) {
  return `
export const CONNECTOR_SECRET_PURPOSES = [
${purposes.map((purpose) => `  '${purpose}',`).join('\n')}
] as const;

export const CONNECTOR_SECRET_COLUMNS: readonly ConnectorSecretColumn[] = [
${columns
  .map(
    (entry) => `  {
    table: '${entry.table}',
    column: '${entry.column}',
    keyColumn: '${entry.keyColumn}',
    purpose: '${entry.purpose}',
  },`,
  )
  .join('\n')}
];

export function openConnectorSecret(ring, sealed, purpose) {
  const opened = openEnvelope(ring, sealed, 'hex-triple', { value: purpose, acceptUnbound: true });
  return { plaintext: opened.plaintext, contextBound: opened.contextBound };
}

export async function resealConnectorSecrets(input) {
  if (opened.contextBound) return;
  return sealEnvelope(input.ring, opened.plaintext, 'hex-triple', target.purpose);
}
`;
}

const BASELINE = {
  purposes: ['custom-connector-auth-header', 'oauth-access-token'],
  columns: [
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
  ],
};

function fixture(declaration, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-reseal-'));
  const files = { [MODULE]: moduleSource(declaration), [MIGRATION]: SCHEMA, ...extra };
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
  }
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('reads both lists out of the module', () => {
  const source = moduleSource(BASELINE);
  assert.deepEqual(declaredPurposes(source), BASELINE.purposes);
  assert.deepEqual(declaredColumns(source), BASELINE.columns);
});

test('a covered declaration passes', () => {
  const result = run(fixture(BASELINE));
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /2 purpose\(s\), 2 column\(s\), 0 failure/u);
});

test('a purpose with no column to walk fails', () => {
  const result = run(
    fixture({ ...BASELINE, purposes: [...BASELINE.purposes, 'oauth-refresh-token'] }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /"oauth-refresh-token" has no column the re-seal would walk/u);
});

test('a column naming a purpose nothing seals fails', () => {
  const result = run(
    fixture({
      ...BASELINE,
      columns: [
        ...BASELINE.columns,
        {
          table: 'public.connector_oauth_grants',
          column: 'refresh_token_enc',
          keyColumn: 'id',
          purpose: 'oauth-refresh-token',
        },
      ],
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /names an unknown purpose/u);
});

test('a column no migration creates fails', () => {
  const result = run(
    fixture({
      purposes: ['oauth-code-verifier'],
      columns: [
        {
          table: 'public.connector_oauth_authorizations',
          column: 'code_verifier_enc',
          keyColumn: 'id',
          purpose: 'oauth-code-verifier',
        },
      ],
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.out, /no migration creates it/u);
});

test('a re-seal that stops reading whether the row was bound fails', () => {
  const source = moduleSource(BASELINE).replace(/opened\.contextBound/gu, 'true');
  const result = run(fixture(BASELINE, { [MODULE]: source }));
  assert.equal(result.code, 1);
  assert.match(result.out, /no longer reads whether the ciphertext it opened was bound/u);
});

test('a re-seal that stops re-sealing fails', () => {
  const source = moduleSource(BASELINE).replace(/sealEnvelope\(/gu, 'identity(');
  const result = run(fixture(BASELINE, { [MODULE]: source }));
  assert.equal(result.code, 1);
  assert.match(result.out, /no longer re-seals what it found unbound/u);
});
