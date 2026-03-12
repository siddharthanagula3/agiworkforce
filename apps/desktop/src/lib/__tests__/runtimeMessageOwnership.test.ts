import { describe, expect, it } from 'vitest';
import type { EnhancedMessage } from '../../stores/chat/types';
import {
  getActiveConversationMessages,
  resolveActiveConversationMessageId,
  resolveTranscriptMessageId,
} from '../runtimeMessageOwnership';

const createMessage = (
  overrides: Partial<EnhancedMessage> & Pick<EnhancedMessage, 'id' | 'role' | 'content'>,
): EnhancedMessage => ({
  timestamp: new Date('2026-03-11T12:00:00.000Z'),
  ...overrides,
});

describe('runtimeMessageOwnership', () => {
  it('returns active-conversation messages when available', () => {
    const globalMessage = createMessage({
      id: 'global-assistant',
      role: 'assistant',
      content: 'Global message',
    });
    const activeMessage = createMessage({
      id: 'active-assistant',
      role: 'assistant',
      content: 'Active message',
    });

    const messages = getActiveConversationMessages({
      activeConversationId: 'conversation-1',
      messages: [globalMessage],
      messagesByConversation: {
        'conversation-1': [activeMessage],
      },
    });

    expect(messages).toEqual([activeMessage]);
  });

  it('prefers the current streaming message when it belongs to the conversation', () => {
    const targetMessage = createMessage({
      id: 'assistant-streaming',
      role: 'assistant',
      content: 'Working...',
    });

    const messageId = resolveActiveConversationMessageId({
      activeConversationId: 'conversation-1',
      currentStreamingMessageId: 'assistant-streaming',
      messagesByConversation: {
        'conversation-1': [targetMessage],
      },
    });

    expect(messageId).toBe('assistant-streaming');
  });

  it('falls back to the latest assistant when no streaming message is present', () => {
    const messageId = resolveTranscriptMessageId([
      createMessage({ id: 'user-1', role: 'user', content: 'Do the work' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'I am on it' }),
    ]);

    expect(messageId).toBe('assistant-1');
  });

  it('falls back to the latest system message when no assistant exists', () => {
    const messageId = resolveTranscriptMessageId([
      createMessage({ id: 'user-1', role: 'user', content: 'Do the work' }),
      createMessage({ id: 'system-1', role: 'system', content: 'Queued operation' }),
    ]);

    expect(messageId).toBe('system-1');
  });

  it('can prefer a streaming assistant marker when requested', () => {
    const messageId = resolveTranscriptMessageId(
      [
        createMessage({ id: 'assistant-1', role: 'assistant', content: 'Waiting' }),
        createMessage({
          id: 'assistant-2',
          role: 'assistant',
          content: 'Streaming',
          metadata: { streaming: true },
        }),
      ],
      null,
      { allowStreamingAssistantFallback: true },
    );

    expect(messageId).toBe('assistant-2');
  });
});
