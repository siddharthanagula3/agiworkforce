import { describe, expect, it } from 'vitest';
import {
  applyStreamFailure,
  resolveComposerPrompt,
  selectModelHistory,
  shouldRebuildMessageDom,
  trimChatMessages,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

function message(index: number, role: 'user' | 'assistant' = 'user'): SidePanelChatMessage {
  return {
    id: `message-${index}`,
    role,
    content: `content-${index}`,
    timestamp: index,
  };
}

describe('side-panel chat state', () => {
  it('creates a visible prompt for attachment-only turns', () => {
    expect(resolveComposerPrompt('', 1)).toBe('Please analyze the attached image.');
    expect(resolveComposerPrompt('   ', 2)).toBe('Please analyze the attached images.');
  });

  it('does not create an empty turn when there is no text or attachment', () => {
    expect(resolveComposerPrompt('   ', 0)).toBeNull();
  });

  it('preserves the user prompt when attachments are present', () => {
    expect(resolveComposerPrompt('  Compare these screenshots  ', 2)).toBe(
      'Compare these screenshots',
    );
  });

  it('turns a partial assistant stream into one terminal error instead of duplicating its id', () => {
    const messages = [
      message(1),
      { ...message(2, 'assistant'), id: 'stream-1', content: 'partial', streaming: true },
    ];

    applyStreamFailure(messages, 'stream-1', 'network lost', 3);

    expect(messages.filter((entry) => entry.id === 'stream-1')).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({
      content: 'partial\n\nError: network lost',
      streaming: false,
      error: true,
    });
  });

  it('creates a terminal error when no assistant stream was rendered yet', () => {
    const messages = [message(1)];

    applyStreamFailure(messages, 'stream-2', 'request rejected', 2);

    expect(messages.at(-1)).toMatchObject({
      id: 'stream-2',
      role: 'assistant',
      content: 'Error: request rejected',
      error: true,
    });
  });

  it('bounds the live conversation to the newest messages', () => {
    const messages = Array.from({ length: 55 }, (_, index) => message(index));

    expect(trimChatMessages(messages, 50)).toBe(5);
    expect(messages).toHaveLength(50);
    expect(messages[0]?.id).toBe('message-5');
    expect(messages.at(-1)?.id).toBe('message-54');
  });

  it('keeps UI failures and the current user turn out of model history', () => {
    const messages: SidePanelChatMessage[] = [
      message(1),
      { ...message(2, 'assistant'), error: true },
      message(3),
    ];

    expect(selectModelHistory(messages, 'message-3')).toEqual([
      { role: 'user', content: 'content-1' },
    ]);
  });

  it('forces a DOM rebuild after trimming even when retained length is unchanged', () => {
    expect(
      shouldRebuildMessageDom({ forceRebuild: true, renderedCount: 50, messageCount: 50 }),
    ).toBe(true);
    expect(
      shouldRebuildMessageDom({ forceRebuild: false, renderedCount: 50, messageCount: 51 }),
    ).toBe(false);
  });
});
