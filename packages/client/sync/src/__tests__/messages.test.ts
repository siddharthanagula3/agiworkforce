import { describe, it, expect } from 'vitest';
import { applyMessageDeltas, toMessagePushItem, isSyncableMessageRole } from '../messages';
import type { MessageWireDelta } from '@agiworkforce/cloud-contracts';
import { createInMemoryMessagePort } from './test-ports';

const T = '2026-07-01T00:00:00.000Z';
const T2 = '2026-07-01T00:00:01.000Z';

function delta(over: Partial<MessageWireDelta> = {}): MessageWireDelta {
  return {
    id: 'm1',
    conversation_id: 'c1',
    role: 'user',
    content: 'hi',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_cents: 0,
    metadata: null,
    created_at: T,
    updated_at: T,
    deleted_at: null,
    server_version: '1',
    ...over,
  };
}

describe('applyMessageDeltas', () => {
  it('inserts new messages sorted by createdAt', () => {
    const port = createInMemoryMessagePort();
    applyMessageDeltas(port, [
      delta({ id: 'm2', content: 'second', created_at: T2, server_version: '2' }),
      delta({ id: 'm1', content: 'first', created_at: T, server_version: '1' }),
    ]);
    expect(port.getMessages('c1').map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('breaks a createdAt tie by id (localeCompare)', () => {
    const port = createInMemoryMessagePort();
    applyMessageDeltas(port, [
      delta({ id: 'mZ', created_at: T }),
      delta({ id: 'mA', created_at: T }),
    ]);
    expect(port.getMessages('c1').map((m) => m.id)).toEqual(['mA', 'mZ']);
  });

  it('removes a message on a tombstone delta', () => {
    const port = createInMemoryMessagePort({
      c1: [{ id: 'm1', role: 'user', content: 'hi', createdAt: T }],
    });
    applyMessageDeltas(port, [delta({ deleted_at: T2 })]);
    expect(port.getMessages('c1')).toEqual([]);
  });

  it('groups deltas by conversation and only touches each conversation once', () => {
    const port = createInMemoryMessagePort();
    applyMessageDeltas(port, [
      delta({ id: 'm1', conversation_id: 'c1' }),
      delta({ id: 'm2', conversation_id: 'c2' }),
    ]);
    expect(port.getMessages('c1').map((m) => m.id)).toEqual(['m1']);
    expect(port.getMessages('c2').map((m) => m.id)).toEqual(['m2']);
  });

  it('stores a message under a conversation id that has no known parent yet (no FK / no buffering)', () => {
    const port = createInMemoryMessagePort();
    applyMessageDeltas(port, [delta({ conversation_id: 'c-not-yet-known' })]);
    expect(port.getMessages('c-not-yet-known').map((m) => m.id)).toEqual(['m1']);
  });

  it('omits model/provider keys entirely when the delta has neither', () => {
    const port = createInMemoryMessagePort();
    applyMessageDeltas(port, [delta({ model: null, provider: null })]);
    const msg = port.getMessages('c1')[0];
    expect(msg && 'model' in msg).toBe(false);
    expect(msg && 'provider' in msg).toBe(false);
  });
});

describe('isSyncableMessageRole', () => {
  it('accepts user/assistant/system', () => {
    expect(isSyncableMessageRole('user')).toBe(true);
    expect(isSyncableMessageRole('assistant')).toBe(true);
    expect(isSyncableMessageRole('system')).toBe(true);
  });

  it('rejects tool and other client-local roles', () => {
    expect(isSyncableMessageRole('tool')).toBe(false);
    expect(isSyncableMessageRole('anything-else')).toBe(false);
  });
});

describe('toMessagePushItem', () => {
  it('maps a full record to the camelCase wire shape', () => {
    const item = toMessagePushItem('c1', {
      id: 'm1',
      role: 'assistant',
      content: 'hello',
      model: 'gpt-5.4',
      provider: 'openai',
      createdAt: T,
    });
    expect(item).toEqual({
      id: 'm1',
      conversationId: 'c1',
      role: 'assistant',
      content: 'hello',
      model: 'gpt-5.4',
      provider: 'openai',
    });
    expect(item).not.toHaveProperty('createdAt');
  });

  it('nulls out missing optional model/provider', () => {
    const item = toMessagePushItem('c1', { id: 'm1', role: 'user', content: 'hi' });
    expect(item.model).toBeNull();
    expect(item.provider).toBeNull();
  });
});
