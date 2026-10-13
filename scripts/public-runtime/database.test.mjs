import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOwnedDatabase } from './database.mjs';

test('an ordinary or remotely reached database is rejected before fixture writes', async () => {
  for (const row of [
    { name: 'production', address: null },
    { name: 'owned', address: '127.0.0.1' },
  ]) {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        return { rows: [row] };
      },
    };
    await assert.rejects(assertOwnedDatabase(client, 'owned', 'run'), /escaped/);
    assert.equal(queries.length, 1);
    assert.ok(queries.every((sql) => sql.startsWith('select')));
  }
});

test('an existing local database cannot impersonate a disposable run', async () => {
  for (const markers of [[], [{ run_id: 'other' }], [{ run_id: 'run' }, { run_id: 'run' }]]) {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        return { rows: queries.length === 1 ? [{ name: 'owned', address: null }] : markers };
      },
    };
    await assert.rejects(assertOwnedDatabase(client, 'owned', 'run'), /not owned/);
    assert.ok(queries.every((sql) => sql.startsWith('select')));
  }
});

test('the exact owned socket database is accepted without mutating it', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return {
        rows: queries.length === 1 ? [{ name: 'owned', address: null }] : [{ run_id: 'run' }],
      };
    },
  };
  await assert.doesNotReject(assertOwnedDatabase(client, 'owned', 'run'));
  assert.equal(queries.length, 2);
});
