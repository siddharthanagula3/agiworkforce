import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REENCRYPT_TARGETS,
  recordKeyRotationAudit,
  reencryptTarget,
  resolveOperator,
} from './reencrypt.mjs';

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
