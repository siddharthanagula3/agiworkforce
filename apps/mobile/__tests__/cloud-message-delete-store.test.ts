import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';

const T = '2026-06-20T00:00:00.000Z';

function msg(id: string) {
  return {
    id,
    conversationId: 'conv-1',
    role: 'user' as const,
    content: `content-${id}`,
    createdAt: T,
  };
}

beforeEach(() => {
  useChatCloudMessageStore.getState().clearCloudData();
});

describe('deleteCloudMessage', () => {
  it('removes only the targeted message from the targeted conversation', () => {
    useChatCloudMessageStore
      .getState()
      .setCloudMessages('conv-1', [msg('m1'), msg('m2'), msg('m3')]);
    useChatCloudMessageStore.getState().setCloudMessages('conv-2', [msg('m1')]);

    useChatCloudMessageStore.getState().deleteCloudMessage('conv-1', 'm2');

    const conv1Ids = useChatCloudMessageStore.getState().messages['conv-1'].map((m) => m.id);
    expect(conv1Ids).toEqual(['m1', 'm3']);

    expect(useChatCloudMessageStore.getState().messages['conv-2']).toHaveLength(1);
  });

  it('is a no-op when the conversation has no cached messages', () => {
    expect(() =>
      useChatCloudMessageStore.getState().deleteCloudMessage('unknown-conv', 'm1'),
    ).not.toThrow();
    expect(useChatCloudMessageStore.getState().messages['unknown-conv']).toBeUndefined();
  });

  it('is a no-op when the message id is not present', () => {
    useChatCloudMessageStore.getState().setCloudMessages('conv-1', [msg('m1')]);
    useChatCloudMessageStore.getState().deleteCloudMessage('conv-1', 'does-not-exist');
    expect(useChatCloudMessageStore.getState().messages['conv-1']).toHaveLength(1);
  });
});

describe('deleteCloudMessage in a threaded conversation', () => {
  function row(id: string, role: 'user' | 'assistant', parentId: string | null, at: string) {
    return { id, conversationId: 'conv-1', role, content: id, createdAt: at, parentId };
  }

  function seed(activeLeafMessageId: string) {
    useChatCloudMessageStore.getState().setCloudConversations([
      {
        id: 'conv-1',
        title: 'Thread',
        createdAt: T,
        updatedAt: T,
        messageCount: 4,
        pinned: false,
        executionMode: 'cloud',
        activeLeafMessageId,
      },
    ] as never);
    useChatCloudMessageStore
      .getState()
      .setCloudMessages('conv-1', [
        row('u1', 'user', null, '2026-06-20T00:00:00.000Z'),
        row('a1', 'assistant', 'u1', '2026-06-20T00:00:01.000Z'),
        row('u2', 'user', 'a1', '2026-06-20T00:00:02.000Z'),
        row('a2', 'assistant', 'u2', '2026-06-20T00:00:03.000Z'),
      ]);
  }

  it('hands the deleted row children to its parent so later turns stay in the thread', () => {
    seed('a2');

    useChatCloudMessageStore.getState().deleteCloudMessage('conv-1', 'a1');

    const rows = useChatCloudMessageStore.getState().messages['conv-1'];
    expect(rows.map((m) => m.id)).toEqual(['u1', 'u2', 'a2']);
    expect(rows.find((m) => m.id === 'u2')?.parentId).toBe('u1');
    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'conv-1')
        ?.activeLeafMessageId,
    ).toBe('a2');
  });

  it('moves the leaf to a surviving message when the leaf itself is deleted', () => {
    seed('a2');

    useChatCloudMessageStore.getState().deleteCloudMessage('conv-1', 'a2');

    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'conv-1')
        ?.activeLeafMessageId,
    ).toBe('u2');
  });
});
