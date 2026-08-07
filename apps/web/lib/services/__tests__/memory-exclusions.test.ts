import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { ManagedMemoryContextDb } from '../managed-memory-context-service';
import {
  MAX_MEMORY_EXCLUSIONS,
  isMemoryExcluded,
  loadMemoryExclusions,
  normalizeMemoryExclusions,
  persistManagedAutoMemoryFacts,
} from '../managed-memory-context-service';

/**
 * Sensitive-data exclusions are enforced on the WRITE path, before a candidate
 * reaches `user_memories`. The failure this guards is specific: filtering in
 * the UI would leave the fact stored and merely hidden, so the product would
 * tell the user something was excluded while it sat in the database and kept
 * being fed to the model.
 *
 * A settings outage must not silently disable the filter either — that is the
 * same false claim by a different route.
 */

/** Minimal db double that records statements and answers the settings read. */
function fakeDb(options: { settings?: unknown; inserted?: string[] } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const db: ManagedMemoryContextDb & { calls: typeof calls } = {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("settings -> 'memory'")) {
        return (options.settings === undefined ? [] : [{ memory: options.settings }]) as never;
      }
      if (sql.includes('insert into user_memories')) {
        return (options.inserted ?? []).map((id) => ({ id })) as never;
      }
      return [] as never;
    },
  };
  return db;
}

/** The rows the insert statement was actually given. */
function insertedBatch(db: ReturnType<typeof fakeDb>) {
  const call = db.calls.find((entry) => entry.sql.includes('insert into user_memories'));
  if (!call) return null;
  return JSON.parse(String(call.params?.[1])) as Array<{ content: string }>;
}

describe('normalizeMemoryExclusions', () => {
  it('lowercases, trims, and de-duplicates', () => {
    expect(normalizeMemoryExclusions(['  Home Address ', 'home address', 'SSN'])).toEqual([
      'home address',
      'ssn',
    ]);
  });

  it('drops terms too short to be meaningful', () => {
    // A one- or two-character term matches nearly every sentence and would
    // disable memory wholesale without saying so.
    expect(normalizeMemoryExclusions(['a', 'ab', 'abc'])).toEqual(['abc']);
  });

  it('ignores non-strings and non-arrays instead of throwing', () => {
    // This runs on the write path; a malformed settings blob must not stop the
    // filter applying to the terms that ARE valid.
    expect(normalizeMemoryExclusions(['valid', 42, null, { a: 1 }])).toEqual(['valid']);
    expect(normalizeMemoryExclusions('nope')).toEqual([]);
    expect(normalizeMemoryExclusions(undefined)).toEqual([]);
  });

  it('bounds the list', () => {
    const many = Array.from({ length: MAX_MEMORY_EXCLUSIONS + 20 }, (_, i) => `term-${i}`);
    expect(normalizeMemoryExclusions(many)).toHaveLength(MAX_MEMORY_EXCLUSIONS);
  });
});

describe('isMemoryExcluded', () => {
  it('matches case-insensitively anywhere in the content', () => {
    expect(isMemoryExcluded('User lives at 12 Elm Street', ['elm street'])).toBe(true);
  });

  it('does not match unrelated content', () => {
    expect(isMemoryExcluded('User prefers dark mode', ['elm street'])).toBe(false);
  });

  it('is a no-op with no exclusions', () => {
    expect(isMemoryExcluded('anything at all', [])).toBe(false);
  });
});

describe('loadMemoryExclusions', () => {
  it('reads the stored list', async () => {
    const db = fakeDb({ settings: { excludedTerms: ['salary', 'home address'] } });

    await expect(loadMemoryExclusions(db, { userId: 'u1' })).resolves.toEqual([
      'salary',
      'home address',
    ]);
  });

  it('returns an empty list when the account has no settings row', async () => {
    const db = fakeDb();

    await expect(loadMemoryExclusions(db, { userId: 'u1' })).resolves.toEqual([]);
  });

  it('survives a malformed settings blob', async () => {
    const db = fakeDb({ settings: 'not-an-object' });

    await expect(loadMemoryExclusions(db, { userId: 'u1' })).resolves.toEqual([]);
  });
});

describe('persistManagedAutoMemoryFacts — exclusions', () => {
  it('never writes a candidate matching an exclusion', async () => {
    const db = fakeDb({ settings: { excludedTerms: ['salary'] }, inserted: ['id-1'] });

    const result = await persistManagedAutoMemoryFacts(db, {
      userId: 'u1',
      candidates: ['User prefers dark mode', 'User salary is 120000'],
    });

    const batch = insertedBatch(db);
    expect(batch).toHaveLength(1);
    expect(batch![0]!.content).toBe('User prefers dark mode');
    // The excluded fact must not appear in the statement at all — not filtered
    // out afterwards, not written and hidden.
    expect(JSON.stringify(batch)).not.toContain('120000');
    expect(result.excluded).toBe(1);
  });

  it('reports how many candidates were dropped', async () => {
    const db = fakeDb({ settings: { excludedTerms: ['salary', 'address'] } });

    const result = await persistManagedAutoMemoryFacts(db, {
      userId: 'u1',
      candidates: ['salary is 1', 'address is 2'],
    });

    expect(result.excluded).toBe(2);
    expect(result.inserted).toBe(0);
    // Nothing to insert means no insert statement was issued.
    expect(insertedBatch(db)).toBeNull();
  });

  it('writes normally when the account has no exclusions', async () => {
    const db = fakeDb({ inserted: ['id-1'] });

    const result = await persistManagedAutoMemoryFacts(db, {
      userId: 'u1',
      candidates: ['User prefers dark mode'],
    });

    expect(insertedBatch(db)).toHaveLength(1);
    expect(result.excluded).toBe(0);
  });

  it('consults the exclusion list before inserting, not after', async () => {
    const db = fakeDb({ settings: { excludedTerms: ['secret'] }, inserted: [] });

    await persistManagedAutoMemoryFacts(db, { userId: 'u1', candidates: ['a secret fact'] });

    const settingsIndex = db.calls.findIndex((c) => c.sql.includes("settings -> 'memory'"));
    const insertIndex = db.calls.findIndex((c) => c.sql.includes('insert into user_memories'));
    expect(settingsIndex).toBeGreaterThanOrEqual(0);
    // -1 here means no insert happened at all, which is the desired outcome.
    expect(insertIndex === -1 || settingsIndex < insertIndex).toBe(true);
  });
});
