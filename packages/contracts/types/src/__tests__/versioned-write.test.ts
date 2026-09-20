import { describe, expect, it } from 'vitest';

import contract from '../resource-metadata-contract.json' with { type: 'json' };
import {
  RESOURCE_METADATA_ROLES,
  WRITE_OUTCOMES,
  mergeVersionedWrite,
  overwriteNeedsAudit,
  resolveVersionedWrite,
  type WriteConflict,
} from '../resource-metadata-contract';

interface Note extends Record<string, unknown> {
  title: string;
  body: string;
}

const stored: Note = { title: 'first', body: 'first body' };

function write(expectedVersion: number, payload: Note) {
  return { expectedVersion, payload };
}

describe('the metadata vocabulary', () => {
  it('names exactly the roles the contract table rules on', () => {
    expect([...RESOURCE_METADATA_ROLES].sort()).toEqual(Object.keys(contract.roles).sort());
  });

  it('places every concurrently edited resource on a table the contract knows', () => {
    for (const [kind, entry] of Object.entries(contract.concurrency)) {
      expect(entry.table.length, kind).toBeGreaterThan(0);
      expect(entry.why.length, kind).toBeGreaterThan(0);
    }
  });
});

describe('a write that quotes the version it read', () => {
  it('lands and advances the version when nothing moved underneath it', () => {
    const result = resolveVersionedWrite<Note>({
      stored,
      storedVersion: 7,
      write: write(7, { title: 'second', body: 'first body' }),
      changedFields: ['title'],
      fieldsChangedSince: [],
    });
    expect(result.outcome).toBe('applied');
    expect(result.currentVersion).toBe(8);
    expect(WRITE_OUTCOMES).toContain(result.outcome);
  });

  it('is refused with the row it lost to, so the reader can refresh in place', () => {
    const result = resolveVersionedWrite<Note>({
      stored,
      storedVersion: 9,
      write: write(7, { title: 'second', body: 'first body' }),
      changedFields: ['title'],
      fieldsChangedSince: ['title'],
    });
    expect(result.outcome).toBe('conflict');
    expect(result.current).toEqual(stored);
    expect(result.currentVersion).toBe(9);
    if (result.outcome !== 'applied') {
      expect(result.expectedVersion).toBe(7);
      expect(result.mergeable).toBe(false);
    }
  });

  it('offers a merge when the two edits touched different fields', () => {
    const result = resolveVersionedWrite<Note>({
      stored,
      storedVersion: 9,
      write: write(7, { title: 'first', body: 'second body' }),
      changedFields: ['body'],
      fieldsChangedSince: ['title'],
    });
    expect(result.outcome).toBe('conflict');
    if (result.outcome === 'applied') return;
    expect(result.mergeable).toBe(true);
    expect(mergeVersionedWrite(result, { title: 'first', body: 'second body' }, ['body'])).toEqual({
      title: 'first',
      body: 'second body',
    });
  });

  it('refuses to merge edits that touched the same field', () => {
    const conflict: WriteConflict<Note> = {
      outcome: 'conflict',
      current: stored,
      currentVersion: 9,
      expectedVersion: 7,
      mergeable: false,
    };
    expect(mergeVersionedWrite(conflict, { title: 'x', body: 'y' }, ['title'])).toBeNull();
  });

  it('tells a reader holding a version the server has never written', () => {
    const result = resolveVersionedWrite<Note>({
      stored,
      storedVersion: 4,
      write: write(11, stored),
      changedFields: ['title'],
      fieldsChangedSince: [],
    });
    expect(result.outcome).toBe('stale_reader');
  });

  it('records an overwrite that discarded someone else, and only that', () => {
    const conflict = resolveVersionedWrite<Note>({
      stored,
      storedVersion: 9,
      write: write(7, stored),
      changedFields: ['title'],
      fieldsChangedSince: ['title'],
    });
    expect(overwriteNeedsAudit(conflict, true)).toBe(true);
    expect(overwriteNeedsAudit(conflict, false)).toBe(false);
    const applied = resolveVersionedWrite<Note>({
      stored,
      storedVersion: 9,
      write: write(9, stored),
      changedFields: ['title'],
      fieldsChangedSince: [],
    });
    expect(overwriteNeedsAudit(applied, true)).toBe(false);
  });
});
