let mockConversations: Array<{ id: string; temporary?: boolean }> = [];
let mockNewChatTemporary = false;

jest.mock('@/stores/chat/conversationRepository', () => ({
  getConversationMessageStore: () => ({
    getState: () => ({ conversations: mockConversations, messages: {} }),
  }),
}));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ isTemporaryChat: mockNewChatTemporary }) },
}));

import {
  isConversationTemporary,
  resolveUploadContext,
} from '@/src/features/chat/upload/uploadContext';

describe('resolveUploadContext', () => {
  beforeEach(() => {
    mockConversations = [];
    mockNewChatTemporary = false;
  });

  it('keeps an ordinary conversation ordinary while the new-chat preference is on', () => {
    mockConversations = [{ id: 'ordinary-chat', temporary: false }];
    mockNewChatTemporary = true;

    expect(resolveUploadContext('ordinary-chat')).toEqual({
      conversationId: 'ordinary-chat',
      temporary: false,
    });
  });

  it('keeps a temporary conversation temporary while the new-chat preference is off', () => {
    mockConversations = [{ id: 'temporary-chat', temporary: true }];

    expect(resolveUploadContext('temporary-chat')).toEqual({
      conversationId: 'temporary-chat',
      temporary: true,
    });
  });

  it('follows the new-chat preference only before a conversation exists', () => {
    mockNewChatTemporary = true;

    expect(resolveUploadContext(undefined)).toEqual({ temporary: true });
    expect(resolveUploadContext('not-created-yet')).toEqual({
      conversationId: 'not-created-yet',
      temporary: true,
    });
  });

  it('treats a conversation with no temporary flag as ordinary', () => {
    expect(isConversationTemporary({})).toBe(false);
  });
});
