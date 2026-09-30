import { describe, it, expect } from 'vitest';
import { mapFetchedManagedProject, mapProjectWireDelta } from '../projects';
import type { ManagedCloudProject, ProjectWireDelta } from '@agiworkforce/cloud-contracts';

const T = '2026-07-01T00:00:00.000Z';

function wire(over: Partial<ProjectWireDelta> = {}): ProjectWireDelta {
  return {
    id: 'p1',
    name: 'Launch plan',
    description: 'Q3 launch',
    instructions: 'Be concise',
    color: '#fff',
    is_archived: false,
    metadata: { foo: 'bar' },
    created_at: T,
    updated_at: T,
    deleted_at: null,
    server_version: '1',
    ...over,
  };
}

describe('mapProjectWireDelta', () => {
  it('maps snake_case to camelCase 1:1', () => {
    expect(mapProjectWireDelta(wire())).toEqual({
      id: 'p1',
      name: 'Launch plan',
      description: 'Q3 launch',
      instructions: 'Be concise',
      color: '#fff',
      isArchived: false,
      metadata: { foo: 'bar' },
      source: 'web',
      createdAt: T,
      updatedAt: T,
      deletedAt: null,
      serverVersion: '1',
    });
  });

  it('always tags a pulled row source as "web" (the wire carries no source field)', () => {
    expect(mapProjectWireDelta(wire()).source).toBe('web');
  });

  it('preserves a tombstone deletedAt', () => {
    expect(mapProjectWireDelta(wire({ deleted_at: T })).deletedAt).toBe(T);
  });

  it('preserves null description/instructions/color/metadata', () => {
    const mapped = mapProjectWireDelta(
      wire({ description: null, instructions: null, color: null, metadata: null }),
    );
    expect(mapped.description).toBeNull();
    expect(mapped.instructions).toBeNull();
    expect(mapped.color).toBeNull();
    expect(mapped.metadata).toBeNull();
  });
});

it('maps an authoritative project GET without inventing a sync version', () => {
  const fetched: ManagedCloudProject & { serverVersion: string } = {
    id: 'p1',
    ownerUserId: 'owner-1',
    serverVersion: '42',
    name: 'Launch plan',
    defaultPrivacyMode: 'managed',
    defaultProviderMode: 'ManagedGateway',
    allowedSurfaces: ['web'],
    createdAt: T,
    updatedAt: T,
  };

  expect(mapFetchedManagedProject(fetched)).toEqual({
    id: 'p1',
    name: 'Launch plan',
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'web',
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    serverVersion: '42',
  });
});
