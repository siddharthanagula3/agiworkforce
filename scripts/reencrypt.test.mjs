import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { openEnvelope, sealEnvelope } from '../apps/web/lib/crypto/envelope.ts';
import {
  REENCRYPT_TARGETS,
  recordKeyRotationAudit,
  reencryptTarget,
  resolveOperator,
} from './reencrypt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONNECTOR_SECRET_MODULE = 'apps/web/lib/crypto/connector-secret-reseal.ts';
const CONNECTOR_KEY_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';

const target = REENCRYPT_TARGETS['two-factor'];

function fakeClient(rows) {
  const queries = [];
  const pages = [...rows, []];
  return {
    queries,
    query(text, params) {
      queries.push({ text, params });
      if (/^\s*select/i.test(text)) return pages.shift() ?? [];
      return [];
    },
  };
}

test('a dry run needs no audit sink and writes nothing', async () => {
  const client = fakeClient([
    [{ user_id: 'u1', totp_secret_key_version: 1, totp_secret_enc: 'ABCDEFGH' }],
  ]);

  const outcome = await reencryptTarget({ target, ring: { active: { id: 2 } }, client });

  assert.equal(outcome.plaintext, 1);
  assert.equal(client.queries.filter((entry) => /^\s*update/i.test(entry.text)).length, 0);
});

test('the audit runs on the apply path and sees the whole outcome', async () => {
  const client = fakeClient([
    [{ user_id: 'u1', totp_secret_key_version: 1, totp_secret_enc: 'ABCDEFGH' }],
  ]);
  const audited = [];

  await reencryptTarget({
    target,
    ring: { active: { id: 2 } },
    client,
    apply: true,
    audit: (outcome) => audited.push(outcome),
  });

  assert.equal(audited.length, 1);
  assert.equal(audited[0].scanned, 1);
});

test('an audit row counts stamped rows, not only rewritten ones', async () => {
  const client = fakeClient([]);

  await recordKeyRotationAudit({
    client,
    name: 'two-factor',
    target,
    keyVersion: 3,
    operator: 'release-bot',
    outcome: { scanned: 9, rewritten: 2, stamped: 7, plaintext: 0 },
  });

  const details = JSON.parse(client.queries[0].params[2]);
  assert.equal(details.count, 9);
  assert.equal(details.stamped, 7);
  assert.equal(details.operator, 'release-bot');
});

test('an unattributed rotation is refused rather than recorded as the script', () => {
  assert.throws(() => resolveOperator({}), /AGI_DB_OPERATOR/);
  assert.throws(() => resolveOperator({ AGI_DB_OPERATOR: '   ' }), /AGI_DB_OPERATOR/);
  assert.equal(resolveOperator({ GITHUB_ACTOR: 'release-bot' }), 'release-bot');
});

const retiredKey = { id: 'k1', material: Buffer.alloc(32, 1) };
const activeKey = { id: 'k2', material: Buffer.alloc(32, 2) };
const rotatedRing = { active: activeKey, retired: [retiredKey] };
const activeOnlyRing = { active: activeKey, retired: [] };

test('a purpose-bound connector secret under the retired key moves to the active key and stays bound', async () => {
  const grants = REENCRYPT_TARGETS['connector-grants'];
  const before = {
    id: 'g1',
    token_key_version: 'k1',
    access_token_enc: sealEnvelope(
      { active: retiredKey, retired: [] },
      'access-1',
      'hex-triple',
      'oauth-access-token',
    ),
    refresh_token_enc: sealEnvelope(
      { active: retiredKey, retired: [] },
      'refresh-1',
      'hex-triple',
      'oauth-refresh-token',
    ),
  };
  const client = fakeClient([[before]]);

  const outcome = await reencryptTarget({
    target: grants,
    ring: rotatedRing,
    client,
    apply: true,
  });

  assert.equal(outcome.rewritten, 1);
  const update = client.queries.find((entry) => /^\s*update/i.test(entry.text));
  const [, accessSealed, refreshSealed] = update.params;
  const bound = (value) => ({ value, acceptUnbound: false });
  assert.equal(
    openEnvelope(activeOnlyRing, accessSealed, 'hex-triple', bound('oauth-access-token')).plaintext,
    'access-1',
  );
  assert.equal(
    openEnvelope(activeOnlyRing, refreshSealed, 'hex-triple', bound('oauth-refresh-token'))
      .plaintext,
    'refresh-1',
  );
});

test('an unbound legacy connector secret is moved without gaining or losing a binding', async () => {
  const connectors = REENCRYPT_TARGETS['custom-connectors'];
  const legacy = sealEnvelope({ active: retiredKey, retired: [] }, 'header-1', 'hex-triple');
  const client = fakeClient([
    [{ id: 'c1', auth_header_key_version: 'k1', auth_header_enc: legacy }],
  ]);

  await reencryptTarget({ target: connectors, ring: rotatedRing, client, apply: true });

  const update = client.queries.find((entry) => /^\s*update/i.test(entry.text));
  const opened = openEnvelope(activeOnlyRing, update.params[1], 'hex-triple');
  assert.equal(opened.plaintext, 'header-1');
  assert.equal(opened.keyId, 'k2');
});

function declaredConnectorSecretColumns() {
  const source = fs.readFileSync(path.join(repoRoot, CONNECTOR_SECRET_MODULE), 'utf8');
  const start = source.indexOf('CONNECTOR_SECRET_COLUMNS');
  const body = source.slice(
    source.indexOf('[', source.indexOf('=', start)),
    source.indexOf('];', start),
  );
  return [...body.matchAll(/\{[^}]*\}/gu)].map(([entry]) => {
    const read = (key) => new RegExp(`${key}:\\s*'([^']+)'`, 'u').exec(entry)?.[1] ?? null;
    return { table: read('table'), column: read('column'), purpose: read('purpose') };
  });
}

/**
 * Connector secret columns the rotation sweep cannot reach yet, each with what
 * it lacks. Retiring a CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY version leaves
 * these unreadable. The list may only shrink.
 */
const UNSWEPT_CONNECTOR_SECRETS = {
  'public.connector_oauth_authorizations.code_verifier_enc':
    'pending authorization, expires ten minutes after it is written; waiting out the expiry is the sweep',
  'public.user_custom_connectors.oauth_client_secret_enc':
    'no key-version column; auth_header_key_version tracks only auth_header_enc',
  'public.mcp_oauth_clients.client_secret_enc': 'no key-version column',
  'public.bank_account_items.access_token_enc': 'no key-version column',
  'public.slack_installations.bot_token_enc': 'no key-version column',
};

function sweptConnectorSecrets() {
  const swept = new Map();
  for (const entry of Object.values(REENCRYPT_TARGETS)) {
    if (entry.keyEnv !== CONNECTOR_KEY_ENV) continue;
    for (const column of entry.secretColumns) {
      swept.set(`${entry.table}.${column}`, entry.purposes?.[column] ?? null);
    }
  }
  return swept;
}

test('every connector secret column has a rotation sweep target or a recorded reason it has none', () => {
  const declared = declaredConnectorSecretColumns();
  assert.ok(declared.length > 0, `${CONNECTOR_SECRET_MODULE} declares no connector secret columns`);
  const swept = sweptConnectorSecrets();

  for (const { table, column, purpose } of declared) {
    const name = `${table}.${column}`;
    if (swept.has(name)) {
      assert.equal(swept.get(name), purpose, `${name} is swept under the wrong purpose`);
      continue;
    }
    assert.ok(
      UNSWEPT_CONNECTOR_SECRETS[name],
      `${name} is sealed under ${CONNECTOR_KEY_ENV} and no reencrypt target sweeps it`,
    );
  }

  const declaredNames = new Set(declared.map(({ table, column }) => `${table}.${column}`));
  for (const name of swept.keys()) {
    assert.ok(
      declaredNames.has(name),
      `${name} is swept but ${CONNECTOR_SECRET_MODULE} does not declare it`,
    );
  }
  for (const name of Object.keys(UNSWEPT_CONNECTOR_SECRETS)) {
    assert.ok(declaredNames.has(name), `${name} is recorded as unswept but is no longer declared`);
    assert.ok(!swept.has(name), `${name} is swept now; drop it from UNSWEPT_CONNECTOR_SECRETS`);
  }
});
