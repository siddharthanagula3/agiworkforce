import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  clampPageSize,
  decodeKeysetCursor,
  encodeKeysetCursor,
  keysetSql,
} from '../pagination';

interface Row {
  id: string;
  updated_at: string;
}

const rows: Row[] = [
  { id: 'c', updated_at: '2026-09-03T00:00:00.000Z' },
  { id: 'b', updated_at: '2026-09-02T00:00:00.000Z' },
  { id: 'a', updated_at: '2026-09-02T00:00:00.000Z' },
];

const keyOf = (row: Row) => ({ sortValue: row.updated_at, id: row.id });

describe('page size', () => {
  it('defaults, floors and ceilings the requested size', () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-10)).toBe(1);
    expect(clampPageSize(MAX_PAGE_SIZE + 500)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(25.9)).toBe(25);
  });
});

describe('keyset cursor', () => {
  it('round-trips and rejects anything it did not write', () => {
    const cursor = { sortValue: '2026-09-02T00:00:00.000Z', id: 'b' };
    expect(decodeKeysetCursor(encodeKeysetCursor(cursor))).toEqual(cursor);
    expect(decodeKeysetCursor(null)).toBeNull();
    expect(decodeKeysetCursor('')).toBeNull();
    expect(decodeKeysetCursor('not-base64url!!')).toBeNull();
    expect(decodeKeysetCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeKeysetCursor(Buffer.from('["a"]').toString('base64url'))).toBeNull();
    expect(decodeKeysetCursor(Buffer.from('["a",1]').toString('base64url'))).toBeNull();
  });
});

describe('page building', () => {
  it('uses the extra row as evidence of another page and drops it', () => {
    const page = buildPage(rows, 2, keyOf);
    expect(page.items.map((row) => row.id)).toEqual(['c', 'b']);
    expect(page.hasMore).toBe(true);
    expect(decodeKeysetCursor(page.nextCursor)).toEqual({
      sortValue: '2026-09-02T00:00:00.000Z',
      id: 'b',
    });
  });

  it('ends the sequence when no extra row came back', () => {
    const page = buildPage(rows, 3, keyOf);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('ends the sequence on an empty result', () => {
    const page = buildPage([], 10, keyOf);
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe('keyset sql', () => {
  it('always breaks ties on the id, so equal timestamps keep one order', () => {
    const { orderBy } = keysetSql({ sortColumn: 'updated_at' });
    expect(orderBy).toBe('order by updated_at desc, id desc');
    expect(keysetSql({ sortColumn: 'created_at', direction: 'asc' }).orderBy).toBe(
      'order by created_at asc, id asc',
    );
  });

  it('compares the same tuple it orders by', () => {
    const cursor = { sortValue: '2026-09-02T00:00:00.000Z', id: 'b' };
    const descending = keysetSql({ sortColumn: 'updated_at', cursor });
    expect(descending.where).toBe('(updated_at, id) < ($1, $2)');
    expect(descending.params).toEqual([cursor.sortValue, cursor.id]);

    const ascending = keysetSql({
      sortColumn: 'updated_at',
      direction: 'asc',
      cursor,
      firstParamIndex: 4,
    });
    expect(ascending.where).toBe('(updated_at, id) > ($4, $5)');
  });

  it('omits the predicate on the first page', () => {
    const first = keysetSql({ sortColumn: 'updated_at' });
    expect(first.where).toBeNull();
    expect(first.params).toEqual([]);
  });

  it('refuses a column name that is not an identifier', () => {
    expect(() => keysetSql({ sortColumn: 'updated_at; drop table users' })).toThrow(/identifier/);
    expect(() => keysetSql({ sortColumn: 'updated_at', idColumn: '1; --' })).toThrow(/identifier/);
  });
});
