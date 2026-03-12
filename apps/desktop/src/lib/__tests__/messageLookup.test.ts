import { describe, expect, it } from 'vitest';
import type { EnhancedMessage } from '../../stores/chat/types';
import { findMessageById, findMessageOwningArtifact } from '../messageLookup';

const createMessage = (
  overrides: Partial<EnhancedMessage> & Pick<EnhancedMessage, 'id' | 'role' | 'content'>,
): EnhancedMessage => ({
  timestamp: new Date('2026-03-12T00:00:00.000Z'),
  ...overrides,
});

describe('messageLookup', () => {
  it('finds a message by id across direct and conversation storage', () => {
    const message = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Working',
    });

    expect(
      findMessageById(
        {
          messages: [],
          messagesByConversation: {
            'conversation-1': [message],
          },
        },
        'assistant-1',
      ),
    ).toEqual(message);
  });

  it('finds artifact owners while preferring the active conversation', () => {
    const activeMessage = createMessage({
      id: 'assistant-active',
      role: 'assistant',
      content: 'Active',
      artifacts: [{ id: 'tool-1', type: 'code', title: 'Tool', content: 'active' }],
    });
    const otherMessage = createMessage({
      id: 'assistant-other',
      role: 'assistant',
      content: 'Other',
      artifacts: [{ id: 'tool-1', type: 'code', title: 'Tool', content: 'other' }],
    });

    const result = findMessageOwningArtifact(
      {
        activeConversationId: 'conversation-1',
        messagesByConversation: {
          'conversation-1': [activeMessage],
          'conversation-2': [otherMessage],
        },
      },
      'tool-1',
    );

    expect(result?.message.id).toBe('assistant-active');
    expect(result?.artifactIndex).toBe(0);
  });

  it('supports Map-based conversation storage used by some tests', () => {
    const message = createMessage({
      id: 'assistant-map',
      role: 'assistant',
      content: 'From map',
      artifacts: [{ id: 'tool-map', type: 'code', title: 'Tool', content: 'map' }],
    });

    const result = findMessageOwningArtifact(
      {
        activeConversationId: 'conversation-1',
        messagesByConversation: new Map([['conversation-1', [message]]]),
      },
      'tool-map',
    );

    expect(result?.message.id).toBe('assistant-map');
  });
});
