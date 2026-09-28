import { describe, expect, it } from 'vitest';

import { handOffConversationSend, takeConversationSend } from './conversation-send-handoff';

describe('conversation send handoff', () => {
  it('hands a message to the conversation once', () => {
    handOffConversationSend('conversation-1', 'Also cover the third quarter');

    expect(takeConversationSend('conversation-2')).toBeNull();
    expect(takeConversationSend('conversation-1')).toBe('Also cover the third quarter');
    expect(takeConversationSend('conversation-1')).toBeNull();
  });

  it('keeps only the latest message handed to a conversation', () => {
    handOffConversationSend('conversation-3', 'first');
    handOffConversationSend('conversation-3', 'second');

    expect(takeConversationSend('conversation-3')).toBe('second');
  });
});
