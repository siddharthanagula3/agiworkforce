import { describe, expect, it } from 'vitest';

import { applyConversationDeltas, toConversationPushItem } from '../conversations';
import { applyMessageDeltas } from '../messages';
import { isSyncTombstoned } from '../tombstones';
import { createInMemoryConversationPort, createInMemoryMessagePort } from './test-ports';

import type { ConversationWireDelta, MessageWireDelta } from '@agiworkforce/cloud-contracts';

function conversationDelta(overrides: Partial<ConversationWireDelta> = {}): ConversationWireDelta {
  return {
    id: 'c1',
    title: 'Quarterly plan',
    model: null,
    project_id: null,
    pinned: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    server_version: '10',
    ...overrides,
  };
}

function messageDelta(overrides: Partial<MessageWireDelta> = {}): MessageWireDelta {
  return {
    id: 'm1',
    conversation_id: 'c1',
    role: 'user',
    content: 'hello',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    metadata: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    server_version: '10',
    ...overrides,
  };
}

/**
 * A deletion that a device forgets is a deletion that device undoes on its next
 * push. These pin the guarantees a surface relies on when the same account is
 * open on three machines: the tombstone survives whatever the device had
 * pending, and a store that keeps tombstones can tell a row it has deleted from
 * one it has never seen.
 */
describe('a deletion reaches every device and stays', () => {
  it('a delete applied after a local edit leaves the tombstone, not the edit', () => {
    const port = createInMemoryConversationPort([
      {
        id: 'c1',
        title: 'Local rename nobody pushed yet',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        messageCount: 3,
        pinned: false,
        serverVersion: '10',
      },
    ]);

    applyConversationDeltas(
      port,
      [conversationDelta({ deleted_at: '2026-09-02T00:00:00.000Z', server_version: '11' })],
      ['c1'],
    );

    expect(port.get('c1')).toBeUndefined();
  });

  it('a store that keeps tombstones records when the deletion happened', () => {
    const tombstones = new Map<string, string>();
    const port = createInMemoryConversationPort([
      {
        id: 'c1',
        title: 'Quarterly plan',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        messageCount: 0,
        pinned: false,
        serverVersion: '10',
      },
    ]);
    const keeping = {
      ...port,
      tombstone: (id: string, deletedAt: string) => tombstones.set(id, deletedAt),
    };

    applyConversationDeltas(
      keeping,
      [conversationDelta({ deleted_at: '2026-09-02T00:00:00.000Z', server_version: '11' })],
      [],
    );

    expect(tombstones.get('c1')).toBe('2026-09-02T00:00:00.000Z');
    expect(isSyncTombstoned({ deletedAt: tombstones.get('c1') ?? null })).toBe(true);
  });

  it('a message store that keeps tombstones keeps the row and marks it deleted', () => {
    const port = createInMemoryMessagePort({ c1: [] });
    port.retainsTombstones = true;

    applyMessageDeltas(port, [messageDelta()]);
    applyMessageDeltas(port, [
      messageDelta({ deleted_at: '2026-09-02T00:00:00.000Z', server_version: '11' }),
    ]);

    const [message] = port.getMessages('c1');
    expect(message?.id).toBe('m1');
    expect(isSyncTombstoned(message ?? {})).toBe(true);
  });

  it('a push built from a live record carries the version it last saw, never a clock', () => {
    const pushed = toConversationPushItem({
      id: 'c1',
      title: 'Quarterly plan',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
      messageCount: 2,
      pinned: false,
      serverVersion: '11',
    });

    expect(pushed.baseVersion).toBe('11');
    expect(Object.keys(pushed)).not.toContain('updatedAt');
  });

  /**
   * The reducer applies a delta whatever version it carries, because a pull is
   * ordered and the cursor never goes backwards. Naming that here means a
   * caller that replays an older page out of order sees a failing test rather
   * than a conversation that came back from the dead in production.
   */
  it('the reducer trusts pull ordering rather than comparing versions itself', () => {
    const port = createInMemoryConversationPort([]);

    applyConversationDeltas(
      port,
      [conversationDelta({ deleted_at: '2026-09-02T00:00:00.000Z', server_version: '11' })],
      [],
    );
    expect(port.get('c1')).toBeUndefined();

    applyConversationDeltas(port, [conversationDelta({ server_version: '10' })], []);
    expect(port.get('c1')?.deletedAt).toBeNull();
  });
});
