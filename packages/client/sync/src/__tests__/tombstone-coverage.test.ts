import { describe, expect, it } from 'vitest';

import { resourceAvailability, partitionByAvailability } from '../availability';
import {
  applyConversationDeltas,
  type ConversationStorePort,
  type SyncConversationRecord,
} from '../conversations';
import { mapMemoryWireDelta } from '../memory';
import { applyMessageDeltas, type MessageStorePort, type SyncMessageRecord } from '../messages';
import {
  applyProjectMetadata,
  mapProjectMetadataWireDelta,
  projectMetadataOf,
  toProjectMetadataPushItem,
} from '../project-metadata';
import { mapProjectWireDelta } from '../projects';
import { applySyncTombstone, isSyncTombstoned, syncTombstoneOf } from '../tombstones';

const DELETED_AT = '2026-09-18T00:00:00.000Z';

function conversationDelta(deletedAt: string | null) {
  return {
    id: 'c1',
    title: 'Planning',
    model: null,
    project_id: null,
    pinned: false,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    deleted_at: deletedAt,
    server_version: '12',
  };
}

function messageDelta(deletedAt: string | null) {
  return {
    id: 'm1',
    conversation_id: 'c1',
    role: 'user' as const,
    content: 'hello',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    metadata: null,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    deleted_at: deletedAt,
    server_version: '12',
  };
}

function projectDelta(deletedAt: string | null) {
  return {
    id: 'p1',
    name: 'Launch',
    description: null,
    instructions: 'ship it',
    color: null,
    is_archived: false,
    metadata: null,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    deleted_at: deletedAt,
    server_version: '12',
  };
}

function memoryDelta(isDeleted: boolean) {
  return {
    id: 'mem1',
    content: 'prefers dark mode',
    category: 'preference',
    source: 'web',
    pinned: false,
    is_deleted: isDeleted,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: DELETED_AT,
    server_version: '12',
  };
}

function conversationPort(): ConversationStorePort & {
  rows: Map<string, Record<string, unknown>>;
  removed: string[];
} {
  const rows = new Map<string, Record<string, unknown>>();
  const removed: string[] = [];
  return {
    rows,
    removed,
    get: (id) => rows.get(id) as unknown as SyncConversationRecord | undefined,
    insert: (record) => void rows.set(record.id, { ...record }),
    patch: (id, patch) => void rows.set(id, { ...rows.get(id), ...patch }),
    remove: (id) => {
      removed.push(id);
      rows.delete(id);
    },
    tombstone: (id, deletedAt) => void rows.set(id, { ...rows.get(id), id, deletedAt }),
  };
}

function messagePort(retainsTombstones: boolean): MessageStorePort & {
  stored: Map<string, ReadonlyArray<SyncMessageRecord>>;
} {
  const stored = new Map<string, ReadonlyArray<SyncMessageRecord>>();
  return {
    stored,
    retainsTombstones,
    getMessages: (conversationId) => stored.get(conversationId) ?? [],
    setMessages: (conversationId, messages) => void stored.set(conversationId, messages),
  };
}

describe('every synced object type carries a deletedAt tombstone', () => {
  it('conversations record the tombstone the wire delta carries', () => {
    const port = conversationPort();
    applyConversationDeltas(port, [conversationDelta(null)], []);
    expect(port.rows.get('c1')).toHaveProperty('deletedAt', null);

    applyConversationDeltas(port, [conversationDelta(DELETED_AT)], []);
    expect(port.rows.get('c1')).toMatchObject({ deletedAt: DELETED_AT });
    expect(port.removed).toEqual([]);
  });

  it('drops a deleted conversation only when the store cannot hold a tombstone', () => {
    const port = conversationPort();
    const withoutTombstones: ConversationStorePort = {
      get: port.get,
      insert: port.insert,
      patch: port.patch,
      remove: port.remove,
    };
    applyConversationDeltas(withoutTombstones, [conversationDelta(DELETED_AT)], []);
    expect(port.removed).toEqual(['c1']);
  });

  it('messages record the tombstone, and retain the row when the store holds them', () => {
    const live = messagePort(false);
    applyMessageDeltas(live, [messageDelta(null)]);
    expect(live.stored.get('c1')?.[0]).toHaveProperty('deletedAt', null);

    applyMessageDeltas(live, [messageDelta(DELETED_AT)]);
    expect(live.stored.get('c1')).toEqual([]);

    const retaining = messagePort(true);
    applyMessageDeltas(retaining, [messageDelta(DELETED_AT)]);
    expect(retaining.stored.get('c1')?.[0]).toMatchObject({ deletedAt: DELETED_AT });
  });

  it('projects and project metadata carry the same tombstone', () => {
    expect(mapProjectWireDelta(projectDelta(DELETED_AT))).toMatchObject({ deletedAt: DELETED_AT });
    expect(mapProjectMetadataWireDelta(projectDelta(DELETED_AT))).toMatchObject({
      deletedAt: DELETED_AT,
    });
    expect(mapProjectWireDelta(projectDelta(null)).deletedAt).toBeNull();
  });

  it('memory carries a tombstone timestamp beside its deleted flag', () => {
    expect(mapMemoryWireDelta(memoryDelta(true))).toMatchObject({
      isDeleted: true,
      deletedAt: DELETED_AT,
    });
    expect(mapMemoryWireDelta(memoryDelta(false)).deletedAt).toBeNull();
  });

  it('reads a tombstone the same way whatever the object type', () => {
    expect(isSyncTombstoned({ deletedAt: DELETED_AT })).toBe(true);
    expect(isSyncTombstoned({ deletedAt: null })).toBe(false);
    expect(isSyncTombstoned({})).toBe(false);
    expect(syncTombstoneOf({})).toBeNull();

    const removed: string[] = [];
    applySyncTombstone({ remove: (id) => void removed.push(id) }, 'x', DELETED_AT);
    expect(removed).toEqual(['x']);
  });
});

describe('project metadata syncs without the fields it does not carry', () => {
  it('leaves instructions alone when only the metadata changed', () => {
    const project = mapProjectWireDelta(projectDelta(null));
    const renamed = { ...projectMetadataOf(project), name: 'Launch v2', serverVersion: '13' };

    const applied = applyProjectMetadata(project, renamed);
    expect(applied.name).toBe('Launch v2');
    expect(applied.instructions).toBe('ship it');
    expect(toProjectMetadataPushItem(renamed).baseVersion).toBe('13');
  });
});

describe('cloud sync does not assume the bytes are in the cloud', () => {
  it('names the device holding a resource this one cannot open', () => {
    const elsewhere = resourceAvailability(
      {
        resourceId: 'f1',
        storedInCloud: false,
        holdingDeviceId: 'device-b',
        holdingDeviceName: "Sam's desktop",
        byteSize: 2_048,
      },
      'device-a',
    );
    expect(elsewhere).toEqual({
      state: 'on-another-device',
      deviceId: 'device-b',
      deviceName: "Sam's desktop",
    });
  });

  it('separates what this device can open from what it cannot', () => {
    const partitioned = partitionByAvailability(
      [
        {
          resourceId: 'a',
          storedInCloud: true,
          holdingDeviceId: null,
          holdingDeviceName: null,
          byteSize: 1,
        },
        {
          resourceId: 'b',
          storedInCloud: false,
          holdingDeviceId: 'device-a',
          holdingDeviceName: 'here',
          byteSize: 1,
        },
        {
          resourceId: 'c',
          storedInCloud: false,
          holdingDeviceId: 'device-b',
          holdingDeviceName: 'there',
          byteSize: 1,
        },
        {
          resourceId: 'd',
          storedInCloud: false,
          holdingDeviceId: null,
          holdingDeviceName: null,
          byteSize: null,
        },
      ],
      'device-a',
    );
    expect(partitioned.openable.map((r) => r.resourceId)).toEqual(['a', 'b']);
    expect(partitioned.elsewhere.map((r) => r.resourceId)).toEqual(['c']);
    expect(partitioned.unavailable.map((r) => r.resourceId)).toEqual(['d']);
  });
});
