import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { sealEnvelope } from '../apps/web/lib/crypto/envelope.ts';
import { REENCRYPT_TARGETS } from './reencrypt.mjs';
import { parseArgs, runRotationDrill } from './key-rotation-drill.mjs';

function fakeFetch({ onDelete } = {}) {
  return async (url, options) => {
    if (options.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          branch: { id: 'br-drill-rotation' },
          connection_uris: [
            { connection_uri: 'postgresql://EXAMPLE:EXAMPLE@db.example.com/neondb' },
          ],
        }),
      };
    }
    if (options.method === 'DELETE') {
      onDelete?.(url);
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`Unexpected method: ${options.method}`);
  };
}

function applyUpdate(row, text, params) {
  const setClause = text.match(/set (.+) where/)[1];
  const columns = setClause.split(', ').map((assignment) => assignment.split(' = ')[0]);
  for (const [index, column] of columns.entries()) {
    row[column] = params[index + 1];
  }
}

function buildFakeQuery({ target, row }) {
  return async (text, params = []) => {
    if (text === 'select 1') return [{}];
    if (text.startsWith('update')) {
      applyUpdate(row, text, params);
      return [];
    }
    if (text.includes(`${target.keyVersionColumn} <> $1`)) {
      const alreadyRotated = row[target.keyVersionColumn] === params[0];
      return params.length > 2 || alreadyRotated ? [] : [{ ...row }];
    }
    if (text.includes(`${target.keyVersionColumn} = $1`)) {
      return row[target.keyVersionColumn] === params[0] ? [{ ...row }] : [];
    }
    throw new Error(`Unexpected query: ${text}`);
  };
}

test('parseArgs requires --target and validates --sample', () => {
  assert.throws(() => parseArgs([]), /--target/);
  assert.throws(() => parseArgs(['--target=nope']), /Unknown target/);
  assert.throws(() => parseArgs(['--target=connector-grants', '--sample=0']), /--sample/);
  const args = parseArgs(['--target=connector-grants', '--sample=3', '--keep']);
  assert.equal(args.target, 'connector-grants');
  assert.equal(args.sample, 3);
  assert.equal(args.keep, true);
});

test('runRotationDrill rotates a sample row and confirms it decrypts under the new key', async () => {
  const target = REENCRYPT_TARGETS['connector-grants'];
  const oldRing = {
    active: { id: '1', material: randomBytes(32) },
    retired: [],
  };
  const newRing = {
    active: { id: '2', material: randomBytes(32) },
    retired: [oldRing.active],
  };

  const row = {
    id: 'row-1',
    token_key_version: '1',
    access_token_enc: sealEnvelope(oldRing, 'access-secret', 'hex-triple'),
    refresh_token_enc: sealEnvelope(oldRing, 'refresh-secret', 'hex-triple'),
  };

  let deleted = false;
  const fetchImpl = fakeFetch({ onDelete: () => (deleted = true) });

  const report = await runRotationDrill({
    targetName: 'connector-grants',
    apiKey: 'test-key',
    projectId: 'proj-1',
    sampleSize: 5,
    fetchImpl,
    buildQueryImpl: () => buildFakeQuery({ target, row }),
    loadRing: () => newRing,
  });

  assert.equal(deleted, true);
  assert.equal(report.branchId, 'br-drill-rotation');
  const outcome = report.targets['connector-grants'];
  assert.equal(outcome.scanned, 1);
  assert.equal(outcome.rewritten, 1);
  assert.equal(outcome.sample.checked, 2);
  assert.equal(outcome.sample.failed, 0);
  assert.equal(row.token_key_version, '2');
});

test('runRotationDrill reports a failed sample decrypt without throwing', async () => {
  const target = REENCRYPT_TARGETS['connector-grants'];
  const wrongRing = { active: { id: '9', material: randomBytes(32) }, retired: [] };
  const newRing = { active: { id: '2', material: randomBytes(32) }, retired: [] };

  const row = {
    id: 'row-1',
    token_key_version: '2',
    access_token_enc: sealEnvelope(wrongRing, 'access-secret', 'hex-triple'),
    refresh_token_enc: sealEnvelope(wrongRing, 'refresh-secret', 'hex-triple'),
  };

  const report = await runRotationDrill({
    targetName: 'connector-grants',
    apiKey: 'test-key',
    projectId: 'proj-1',
    fetchImpl: fakeFetch(),
    buildQueryImpl: () => buildFakeQuery({ target, row }),
    loadRing: () => newRing,
  });

  const outcome = report.targets['connector-grants'];
  assert.equal(outcome.scanned, 0);
  assert.equal(outcome.sample.failed, 2);
});

test('runRotationDrill keeps the branch when keep is true', async () => {
  const target = REENCRYPT_TARGETS['connector-grants'];
  const ring = { active: { id: '2', material: randomBytes(32) }, retired: [] };
  const row = {
    id: 'row-1',
    token_key_version: '2',
    access_token_enc: sealEnvelope(ring, 'access-secret', 'hex-triple'),
    refresh_token_enc: sealEnvelope(ring, 'refresh-secret', 'hex-triple'),
  };
  let deleted = false;

  const report = await runRotationDrill({
    targetName: 'connector-grants',
    apiKey: 'test-key',
    projectId: 'proj-1',
    keep: true,
    fetchImpl: fakeFetch({ onDelete: () => (deleted = true) }),
    buildQueryImpl: () => buildFakeQuery({ target, row }),
    loadRing: () => ring,
  });

  assert.equal(report.kept, true);
  assert.equal(deleted, false);
});

test('runRotationDrill requires an api key and a project id', async () => {
  await assert.rejects(
    runRotationDrill({
      targetName: 'connector-grants',
      projectId: 'proj-1',
      buildQueryImpl: () => async () => [],
    }),
    /NEON_API_KEY/,
  );
  await assert.rejects(
    runRotationDrill({
      targetName: 'connector-grants',
      apiKey: 'test-key',
      buildQueryImpl: () => async () => [],
    }),
    /NEON_PROJECT_ID/,
  );
});
