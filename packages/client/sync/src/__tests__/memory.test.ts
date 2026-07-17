import { describe, it, expect } from 'vitest';
import {
  mapMemoryWireDelta,
  applyMemoryDeltas,
  toMemoryPushItem,
  type SyncMemoryRecord,
} from '../memory';
import type { MemoryWireDelta } from '@agiworkforce/cloud-contracts';

const T = '2026-07-01T00:00:00.000Z';

function wire(over: Partial<MemoryWireDelta> = {}): MemoryWireDelta {
  return {
    id: 'mem1',
    content: 'likes dark mode',
    category: 'preferences',
    source: 'mobile',
    pinned: false,
    is_deleted: false,
    created_at: T,
    updated_at: T,
    server_version: '1',
    ...over,
  };
}

describe('mapMemoryWireDelta', () => {
  it('maps snake_case to camelCase 1:1 for a known source', () => {
    expect(mapMemoryWireDelta(wire())).toEqual({
      id: 'mem1',
      content: 'likes dark mode',
      category: 'preferences',
      source: 'mobile',
      pinned: false,
      isDeleted: false,
      createdAt: T,
      updatedAt: T,
      serverVersion: '1',
    });
  });

  it('normalizes an unknown or null source to "web"', () => {
    expect(mapMemoryWireDelta(wire({ source: null })).source).toBe('web');
    expect(mapMemoryWireDelta(wire({ source: 'some-future-surface' })).source).toBe('web');
  });

  it('passes through the other known surface sources unchanged', () => {
    expect(mapMemoryWireDelta(wire({ source: 'desktop' })).source).toBe('desktop');
    expect(mapMemoryWireDelta(wire({ source: 'auto' })).source).toBe('auto');
  });
});

describe('applyMemoryDeltas', () => {
  const entry = (over: Partial<SyncMemoryRecord> = {}): SyncMemoryRecord => ({
    id: 'mem1',
    content: 'x',
    category: null,
    source: 'mobile',
    pinned: false,
    isDeleted: false,
    createdAt: T,
    updatedAt: T,
    ...over,
  });

  it('upserts a new entry', () => {
    const out = applyMemoryDeltas([], [entry()]);
    expect(out.map((e) => e.id)).toEqual(['mem1']);
  });

  it('replaces an existing entry by id (later delta wins)', () => {
    const out = applyMemoryDeltas([entry({ content: 'old' })], [entry({ content: 'new' })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.content).toBe('new');
  });

  it('hard-deletes a tombstoned entry rather than keeping it as a local tombstone', () => {
    const out = applyMemoryDeltas([entry(), entry({ id: 'mem2' })], [entry({ isDeleted: true })]);
    expect(out.map((e) => e.id)).toEqual(['mem2']);
  });

  it('leaves unrelated entries untouched', () => {
    const untouched = entry({ id: 'mem2', content: 'keep me' });
    const out = applyMemoryDeltas([untouched], [entry({ id: 'mem3' })]);
    expect(out.find((e) => e.id === 'mem2')).toEqual(untouched);
  });

  it('preserves an in-flight local edit while advancing its CAS base', () => {
    const out = applyMemoryDeltas(
      [entry({ content: 'local edit', pinned: true, serverVersion: '2' })],
      [entry({ content: 'server winner', pinned: false, serverVersion: '9' })],
      ['mem1'],
    );
    expect(out[0]).toMatchObject({ content: 'local edit', pinned: true, serverVersion: '9' });
  });

  it('lets a remote tombstone win over a dirty local edit', () => {
    expect(applyMemoryDeltas([entry()], [entry({ isDeleted: true })], ['mem1'])).toEqual([]);
  });
});

describe('toMemoryPushItem', () => {
  it('emits a base revision and no client clocks', () => {
    const item = toMemoryPushItem({
      id: 'mem1',
      content: 'x',
      category: null,
      source: 'mobile',
      pinned: false,
      isDeleted: false,
      createdAt: T,
      updatedAt: T,
      serverVersion: '7',
    });
    expect(item).toEqual({
      id: 'mem1',
      content: 'x',
      category: null,
      source: 'mobile',
      pinned: false,
      baseVersion: '7',
      isDeleted: false,
    });
    expect(item).not.toHaveProperty('updatedAt');
  });
});
