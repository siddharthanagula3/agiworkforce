import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createQueryDb } from './fake-query-db';
import { createSchemaAbsentDb } from './schema-absent-db';

type Probe = {
  intakes_table: boolean;
  preparations_table: boolean;
  scanned_sha256_column: boolean;
};

const PRESENT: Probe = {
  intakes_table: true,
  preparations_table: true,
  scanned_sha256_column: true,
};

function probeDb(answer: Probe | (() => Probe)) {
  return createQueryDb(async () => [typeof answer === 'function' ? answer() : answer]);
}

async function freshModule() {
  vi.resetModules();
  return import('../schema');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('chatFileSchemaReady', () => {
  it('is true when both tables and the scan verdict column exist', async () => {
    const { chatFileSchemaReady } = await freshModule();

    await expect(chatFileSchemaReady(probeDb(PRESENT).db)).resolves.toBe(true);
  });

  it.each(Object.keys(PRESENT) as Array<keyof Probe>)(
    'is false when %s is missing',
    async (piece) => {
      const { chatFileSchemaReady } = await freshModule();

      await expect(chatFileSchemaReady(probeDb({ ...PRESENT, [piece]: false }).db)).resolves.toBe(
        false,
      );
    },
  );

  it('is false when the probe returns no row', async () => {
    const { chatFileSchemaReady } = await freshModule();

    await expect(chatFileSchemaReady(createQueryDb(async () => []).db)).resolves.toBe(false);
  });

  it('is false against a database without 0422', async () => {
    const { chatFileSchemaReady } = await freshModule();
    const delegate = createQueryDb(async () => []);

    await expect(chatFileSchemaReady(createSchemaAbsentDb(delegate.db))).resolves.toBe(false);
    expect(delegate.query).not.toHaveBeenCalled();
  });

  it('lets a probe failure reach the caller', async () => {
    const { chatFileSchemaReady } = await freshModule();
    const db = {
      query: vi.fn(async () => {
        throw new Error('connection reset');
      }),
    };

    await expect(chatFileSchemaReady(db)).rejects.toThrow('connection reset');
  });

  it('asks the database every time unless the caller asks for the cached answer', async () => {
    const { chatFileSchemaReady } = await freshModule();
    let answer = PRESENT;
    const { db, query } = probeDb(() => answer);

    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(true);
    answer = { ...PRESENT, intakes_table: false };

    await expect(chatFileSchemaReady(db)).resolves.toBe(false);
    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps a present answer for five minutes', async () => {
    const { chatFileSchemaReady } = await freshModule();
    let answer = PRESENT;
    const { db, query } = probeDb(() => answer);

    await chatFileSchemaReady(db, { cached: true });
    answer = { ...PRESENT, scanned_sha256_column: false };

    vi.advanceTimersByTime(5 * 60_000 - 1);
    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(true);
    vi.advanceTimersByTime(1);
    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps an absent answer for one minute, so an applied migration is seen soon', async () => {
    const { chatFileSchemaReady } = await freshModule();
    let answer: Probe = { ...PRESENT, preparations_table: false };
    const { db, query } = probeDb(() => answer);

    await chatFileSchemaReady(db, { cached: true });
    answer = PRESENT;

    vi.advanceTimersByTime(60_000 - 1);
    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(false);
    vi.advanceTimersByTime(1);
    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('never caches an uncached answer', async () => {
    const { chatFileSchemaReady } = await freshModule();
    let answer: Probe = { ...PRESENT, intakes_table: false };
    const { db, query } = probeDb(() => answer);

    await chatFileSchemaReady(db);
    answer = PRESENT;

    await expect(chatFileSchemaReady(db, { cached: true })).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('createSchemaAbsentDb', () => {
  it('passes a probe of an unrelated table to the adapter it wraps', async () => {
    const answer = [{ present: true }];
    const delegate = createQueryDb(async () => answer);
    const db = createSchemaAbsentDb(delegate.db);
    const regclassProbe = `select to_regclass('public.video_generation_jobs') is not null as present`;
    const columnProbe = `select exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'release_ledger' and column_name = 'channel') as present`;

    await expect(db.query(regclassProbe)).resolves.toEqual(answer);
    await expect(db.query(columnProbe)).resolves.toEqual(answer);
    expect(delegate.query.mock.calls.map(([sql]) => sql)).toEqual([regclassProbe, columnProbe]);
  });

  it('answers absent to a probe of the chat file schema without asking the adapter', async () => {
    const delegate = createQueryDb(async () => []);
    const db = createSchemaAbsentDb(delegate.db);

    await expect(
      db.query(`select to_regclass('public.chat_file_intakes') is not null as intakes_table`),
    ).resolves.toEqual([
      { intakes_table: false, preparations_table: false, scanned_sha256_column: false },
    ]);
    expect(delegate.query).not.toHaveBeenCalled();
  });

  it('refuses any other statement naming the chat file schema', async () => {
    const delegate = createQueryDb(async () => []);
    const db = createSchemaAbsentDb(delegate.db);

    await expect(db.query('select id from public.chat_file_intakes')).rejects.toThrow(
      'A database without migration 0422 was sent',
    );
    expect(delegate.query).not.toHaveBeenCalled();
  });
});
