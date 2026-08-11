import { describe, it, expect } from 'vitest';
import {
  applyConversationDeltas,
  toConversationPushItem,
  type SyncConversationRecord,
} from '../conversations';
import type { ConversationWireDelta } from '@agiworkforce/cloud-contracts';
import { createInMemoryConversationPort } from './test-ports';

const T = '2026-07-01T00:00:00.000Z';
const T2 = '2026-07-02T00:00:00.000Z';

function delta(over: Partial<ConversationWireDelta> = {}): ConversationWireDelta {
  return {
    id: 'c1',
    title: 'Hello',
    model: null,
    project_id: null,
    pinned: false,
    created_at: T,
    updated_at: T,
    deleted_at: null,
    server_version: '1',
    ...over,
  };
}

describe('applyConversationDeltas', () => {
  it('inserts a brand-new conversation', () => {
    const port = createInMemoryConversationPort();
    applyConversationDeltas(port, [delta()], []);
    expect(port.get('c1')).toMatchObject({
      id: 'c1',
      title: 'Hello',
      messageCount: 0,
      serverVersion: '1',
    });
  });

  it('patches an existing conversation (LWW) and preserves messageCount', () => {
    const port = createInMemoryConversationPort([
      { id: 'c1', title: 'Old', createdAt: T, updatedAt: T, messageCount: 7, pinned: false },
    ]);
    applyConversationDeltas(port, [delta({ title: 'New', updated_at: T2 })], []);
    expect(port.get('c1')).toMatchObject({ title: 'New', updatedAt: T2, messageCount: 7 });
  });

  it('removes the conversation on a tombstone delta', () => {
    const port = createInMemoryConversationPort([
      { id: 'c1', title: 'Hello', createdAt: T, updatedAt: T, messageCount: 0, pinned: false },
    ]);
    applyConversationDeltas(port, [delta({ deleted_at: T2 })], []);
    expect(port.get('c1')).toBeUndefined();
  });

  it('preserves every locally-dirty mutation while advancing its CAS base', () => {
    const port = createInMemoryConversationPort([
      {
        id: 'c1',
        title: 'New (dirty)',
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: true,
        model: 'local-model',
        projectId: 'local-project',
        serverVersion: '1',
      },
    ]);
    applyConversationDeltas(
      port,
      [
        delta({
          title: 'Old (stale)',
          pinned: false,
          model: 'server-model',
          project_id: 'server-project',
          server_version: '9',
        }),
      ],
      ['c1'],
    );
    expect(port.get('c1')).toMatchObject({
      title: 'New (dirty)',
      pinned: true,
      model: 'local-model',
      projectId: 'local-project',
      serverVersion: '9',
    });
  });

  it('a remote delete wins even over a dirty rename', () => {
    const port = createInMemoryConversationPort([
      {
        id: 'c1',
        title: 'New (dirty)',
        createdAt: T,
        updatedAt: T,
        messageCount: 0,
        pinned: false,
      },
    ]);
    applyConversationDeltas(port, [delta({ title: 'irrelevant', deleted_at: T2 })], ['c1']);
    expect(port.get('c1')).toBeUndefined();
  });

  it('a later delta for the same id wins over an earlier one in the same call', () => {
    const port = createInMemoryConversationPort();
    applyConversationDeltas(
      port,
      [
        delta({ title: 'First', server_version: '1' }),
        delta({ title: 'Second', server_version: '2' }),
      ],
      [],
    );
    expect(port.get('c1')?.title).toBe('Second');
  });

  it('maps null model/project_id to undefined on the record', () => {
    const port = createInMemoryConversationPort();
    applyConversationDeltas(port, [delta({ model: null, project_id: null })], []);
    expect(port.get('c1')?.model).toBeUndefined();
    expect(port.get('c1')?.projectId).toBeUndefined();
  });
});

describe('toConversationPushItem', () => {
  const base: SyncConversationRecord = {
    id: 'c1',
    title: 'Hello',
    createdAt: T,
    updatedAt: T2,
    messageCount: 0,
    pinned: true,
    model: 'fixture-model',
    projectId: 'p1',
    serverVersion: '7',
  };

  it('maps a full record to the camelCase wire shape', () => {
    expect(toConversationPushItem(base)).toEqual({
      id: 'c1',
      title: 'Hello',
      model: 'fixture-model',
      projectId: 'p1',
      pinned: true,
      baseVersion: '7',
    });
  });

  it('nulls out missing optional fields', () => {
    const { model: _model, projectId: _projectId, ...rest } = base;
    const item = toConversationPushItem(rest);
    expect(item.model).toBeNull();
    expect(item.projectId).toBeNull();
  });

  it('uses revision zero for a legacy record and never emits client clocks', () => {
    const { serverVersion: _serverVersion, ...legacy } = base;
    const item = toConversationPushItem(legacy);
    expect(item.baseVersion).toBe('0');
    expect(item).not.toHaveProperty('createdAt');
    expect(item).not.toHaveProperty('updatedAt');
  });
});
