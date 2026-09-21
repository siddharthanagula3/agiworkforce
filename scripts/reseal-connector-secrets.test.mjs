import assert from 'node:assert/strict';
import test from 'node:test';

import {
  columnName,
  describe,
  parseArgs,
  readOnlyDatabase,
  resealOnce,
  selectColumns,
} from './reseal-connector-secrets.mjs';

const { CONNECTOR_SECRET_COLUMNS, openConnectorSecret, RESEAL_BATCH } =
  await import('../apps/web/lib/crypto/connector-secret-reseal.ts');
const { sealEnvelope } = await import('../apps/web/lib/crypto/envelope.ts');

const ring = {
  active: { id: '1', material: Buffer.alloc(32, 7) },
  retired: [],
};

/** One table per column, keyed the way the walk reads and writes it. */
function fakeDatabase(seed) {
  const rows = new Map(Object.entries(seed).map(([key, value]) => [key, new Map(value)]));
  const writes = [];
  return {
    rows,
    writes,
    async query(text, params) {
      const table = /from\s+(\S+)/.exec(text)?.[1];
      const column = /select\s+\S+\s+as key,\s+(\S+) as sealed/.exec(text)?.[1];
      const store = rows.get(`${table}.${column}`);
      if (!store) return [];
      const limit = params[0];
      const after = params.length > 1 ? params[1] : null;
      return [...store.entries()]
        .filter(([key]) => after === null || key > after)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(0, limit)
        .map(([key, sealed]) => ({ key, sealed }));
    },
    async execute(text, params) {
      const table = /update\s+(\S+)/.exec(text)?.[1];
      const column = /set\s+(\S+)\s*=/.exec(text)?.[1];
      const store = rows.get(`${table}.${column}`);
      writes.push({ table, column, id: params[1] });
      store?.set(params[1], params[0]);
    },
  };
}

const [firstColumn] = CONNECTOR_SECRET_COLUMNS;

test('dry run is the default and a bare invocation writes nothing', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.equal(parseArgs(['--apply', '--dry-run']).apply, false);
});

test('a batch outside the module caps is refused rather than silently clamped', () => {
  assert.throws(() => parseArgs([`--batch=${RESEAL_BATCH + 1}`]), /--batch must be between/);
  assert.throws(() => parseArgs(['--batch=0']), /--batch must be between/);
  assert.throws(() => parseArgs(['--max-batches=0']), /--max-batches must be between/);
  assert.equal(parseArgs(['--batch=25']).batchSize, 25);
});

test('an unknown column is refused, so a typo cannot walk nothing and report success', () => {
  assert.throws(() => parseArgs(['--column=public.nope.col']), /Unknown column/);
  assert.equal(selectColumns(null).length, CONNECTOR_SECRET_COLUMNS.length);
  assert.equal(selectColumns(columnName(firstColumn)).length, 1);
});

test('a dry run cannot write even if the walk asks it to', async () => {
  const unbound = sealEnvelope(ring, 'a-secret', 'hex-triple');
  const db = fakeDatabase({ [columnName(firstColumn)]: [['row-1', unbound]] });

  await assert.rejects(
    resealOnce({
      db,
      ring,
      columns: [firstColumn],
      batchSize: 10,
      maxBatches: 1,
      apply: false,
    }),
    /Dry run attempted a write/,
  );
  assert.equal(db.writes.length, 0);
  assert.equal(db.rows.get(columnName(firstColumn)).get('row-1'), unbound);
});

test('an applied run binds the purpose and the value survives it', async () => {
  const unbound = sealEnvelope(ring, 'a-secret', 'hex-triple');
  const db = fakeDatabase({ [columnName(firstColumn)]: [['row-1', unbound]] });

  const outcome = await resealOnce({
    db,
    ring,
    columns: [firstColumn],
    batchSize: 10,
    maxBatches: 1,
    apply: true,
  });

  const stored = db.rows.get(columnName(firstColumn)).get('row-1');
  assert.notEqual(stored, unbound);
  assert.equal(outcome.rebound, 1);
  assert.equal(openConnectorSecret(ring, stored, firstColumn.purpose).plaintext, 'a-secret');
  assert.equal(openConnectorSecret(ring, stored, firstColumn.purpose).contextBound, true);
});

test('a second run over an already bound row rewrites nothing, so it is resumable', async () => {
  const bound = sealEnvelope(ring, 'a-secret', 'hex-triple', firstColumn.purpose);
  const db = fakeDatabase({ [columnName(firstColumn)]: [['row-1', bound]] });

  const outcome = await resealOnce({
    db,
    ring,
    columns: [firstColumn],
    batchSize: 10,
    maxBatches: 1,
    apply: true,
  });

  assert.equal(outcome.alreadyBound, 1);
  assert.equal(outcome.rebound, 0);
  assert.equal(db.writes.length, 0);
});

test('a bounded run stops at its batch cap and says it is not finished', async () => {
  const seed = [];
  for (let index = 0; index < 5; index += 1) {
    seed.push([`row-${index}`, sealEnvelope(ring, `secret-${index}`, 'hex-triple')]);
  }
  const db = fakeDatabase({ [columnName(firstColumn)]: seed });

  const outcome = await resealOnce({
    db,
    ring,
    columns: [firstColumn],
    batchSize: 2,
    maxBatches: 1,
    apply: true,
  });

  assert.equal(outcome.scanned, 2);
  assert.equal(outcome.rebound, 2);
  assert.match(describe(outcome, true), /re-sealed: scanned=2 rebound=2/);
});

test('a row that will not open is recorded and the walk moves past it', async () => {
  const other = { active: { id: '1', material: Buffer.alloc(32, 9) }, retired: [] };
  const unreadable = sealEnvelope(other, 'a-secret', 'hex-triple');
  const readable = sealEnvelope(ring, 'another', 'hex-triple');
  const db = fakeDatabase({
    [columnName(firstColumn)]: [
      ['row-1', unreadable],
      ['row-2', readable],
    ],
  });

  const outcome = await resealOnce({
    db,
    ring,
    columns: [firstColumn],
    batchSize: 10,
    maxBatches: 1,
    apply: true,
  });

  assert.equal(outcome.failures.length, 1);
  assert.equal(outcome.failures[0].id, 'row-1');
  assert.equal(outcome.rebound, 1);
  assert.equal(outcome.complete, false);
});

test('the read-only database passes reads through untouched', async () => {
  const db = fakeDatabase({});
  const guarded = readOnlyDatabase(db);
  assert.deepEqual(await guarded.query('select x as key, y as sealed from nothing', [1]), []);
  assert.throws(() => guarded.execute('update nothing set y = $1', ['x']), /Dry run/);
});
