jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '@/stores/chat/chatViewStore';

describe('per-chat sources', () => {
  beforeEach(() => useChatViewStore.setState({ disabledConnectorIdsByConversation: {} }));

  it('turns a connected app off and back on for one chat only', () => {
    const { toggleChatConnector } = useChatViewStore.getState();
    toggleChatConnector('chat-a', 'gmail');
    toggleChatConnector('chat-b', 'slack');
    expect(useChatViewStore.getState().disabledConnectorIdsByConversation).toEqual({
      'chat-a': ['gmail'],
      'chat-b': ['slack'],
    });
    toggleChatConnector('chat-a', 'gmail');
    expect(useChatViewStore.getState().disabledConnectorIdsByConversation).toEqual({
      'chat-b': ['slack'],
    });
  });

  it('carries the choices made on a new chat over to the conversation it becomes', () => {
    useChatViewStore.getState().toggleChatConnector(NEW_CHAT_STYLE_KEY, 'gmail');
    useChatViewStore.getState().adoptStyleSelection(NEW_CHAT_STYLE_KEY, 'chat-new');
    expect(useChatViewStore.getState().disabledConnectorIdsByConversation).toEqual({
      'chat-new': ['gmail'],
    });
  });
});
