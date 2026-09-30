import {
  handOffConversationSend,
  takeConversationSend,
} from '@/src/features/chat/conversationSendHandoff';

describe('conversation send handoff', () => {
  it('hands a message to its conversation once', () => {
    handOffConversationSend('conversation-1', 'Also cover the third quarter');

    expect(takeConversationSend('conversation-2')).toBeNull();
    expect(takeConversationSend('conversation-1')).toBe('Also cover the third quarter');
    expect(takeConversationSend('conversation-1')).toBeNull();
  });
});
