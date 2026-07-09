import { describe, it, expect } from 'vitest';
import {
  applyConversationDeltas,
  toConversationPushItem,
  type SyncConversationRecord,
} from '../conversations';
import type { ConversationWireDelta } from '../../cloud-contracts/sync';
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
    expect(port.get('c1')).toMatchObject({ id: 'c1', title: 'Hello', messageCount: 0 });
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

  it('preserves a locally-dirty title against a stale (non-deleted) delta', () => {
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
    applyConversationDeltas(port, [delta({ title: 'Old (stale)' })], ['c1']);
    expect(port.get('c1')?.title).toBe('New (dirty)');
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
    model: 'gpt-5.4',
    projectId: 'p1',
  };

  it('maps a full record to the camelCase wire shape', () => {
    expect(toConversationPushItem(base)).toEqual({
      id: 'c1',
      title: 'Hello',
      model: 'gpt-5.4',
      projectId: 'p1',
      pinned: true,
      createdAt: T,
      updatedAt: T2,
    });
  });

  it('nulls out missing optional fields', () => {
    const { model: _model, projectId: _projectId, ...rest } = base;
    const item = toConversationPushItem(rest);
    expect(item.model).toBeNull();
    expect(item.projectId).toBeNull();
  });

  it('falls back updatedAt to createdAt, then now() — never undefined', () => {
    // `??` is nullish-only: an actually-absent (undefined) updatedAt triggers
    // the fallback, but a merely-falsy one (e.g. '') does not — this
    // reproduces the runtime case the fallback guards against despite the
    // field being typed as a required string (defensive against malformed
    // persisted/partial records; matches mobile's original `??` chain).
    const { updatedAt: _updatedAt, ...withoutUpdatedAt } = base;
    const item = toConversationPushItem(
      withoutUpdatedAt as SyncConversationRecord,
      () => '2026-01-01T00:00:00.000Z',
    );
    expect(item.updatedAt).toBe(T);

    const { createdAt: _createdAt, updatedAt: _updatedAt2, ...withoutEither } = base;
    const itemNoTimestamps = toConversationPushItem(
      withoutEither as SyncConversationRecord,
      () => '2026-01-01T00:00:00.000Z',
    );
    expect(itemNoTimestamps.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
