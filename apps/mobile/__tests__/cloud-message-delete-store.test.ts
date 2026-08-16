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
