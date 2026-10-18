import { describe, expect, it } from 'vitest';

import {
  NON_SYNC_SURFACES,
  SYNC_OBJECT_SEMANTICS,
  SYNC_OBJECT_TYPES,
  isSyncObjectType,
  surfaceIsInsideSyncBoundary,
  syncObjectCarriesTombstone,
  syncObjectSemantics,
} from '../sync/object-semantics';

describe('cross-device object semantics', () => {
  it('answers for every object type the product syncs, with no entry left out', () => {
    for (const type of SYNC_OBJECT_TYPES) {
      const semantics = syncObjectSemantics(type);
      expect(semantics.type).toBe(type);
      expect(semantics.surfaces.length).toBeGreaterThan(0);
    }
    expect(Object.keys(SYNC_OBJECT_SEMANTICS).sort()).toEqual([...SYNC_OBJECT_TYPES].sort());
  });

  it('covers the five object types the client package never carried', () => {
    for (const type of ['task', 'notification', 'connector', 'skill', 'device'] as const) {
      expect(isSyncObjectType(type)).toBe(true);
      expect(SYNC_OBJECT_SEMANTICS[type].conflict).toBe('server-authoritative');
    }
  });

  it('keeps a row-level type on a tombstone rather than a hard delete', () => {
    expect(syncObjectCarriesTombstone('conversation')).toBe(true);
    expect(syncObjectCarriesTombstone('message')).toBe(true);
    expect(syncObjectCarriesTombstone('project')).toBe(true);
    expect(syncObjectCarriesTombstone('memory')).toBe(true);
    expect(syncObjectCarriesTombstone('settings')).toBe(false);
  });

  it('resolves a consent control restrictively, not last-writer-wins', () => {
    expect(SYNC_OBJECT_SEMANTICS['memory-controls'].conflict).toBe('restrictive-wins');
  });

  it('states which surfaces are inside the boundary and which are deliberately out', () => {
    expect(surfaceIsInsideSyncBoundary('web')).toBe(true);
    expect(surfaceIsInsideSyncBoundary('desktop')).toBe(true);
    expect(surfaceIsInsideSyncBoundary('mobile')).toBe(true);
    for (const surface of NON_SYNC_SURFACES) {
      expect(surfaceIsInsideSyncBoundary(surface)).toBe(false);
    }
    expect(isSyncObjectType('nonsense')).toBe(false);
  });

  it('does not claim the cloud holds the bytes for every type', () => {
    expect(SYNC_OBJECT_SEMANTICS.artifact.payload).toBe('cloud-or-device');
    expect(SYNC_OBJECT_SEMANTICS.skill.payload).toBe('cloud-or-device');
  });
});
