import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { MessageList } from '../MessageList';

const CONVERSATION_ID = 'conv-list-compaction';

const messages: ChatMessage[] = [
  {
    id: 'user-old',
    role: 'user',
    content: 'An early question',
    timestamp: '2026-08-01T00:00:00.000Z',
    metadata: { compaction: 'summarized' },
  },
  {
    id: 'assistant-old',
    role: 'assistant',
    content: 'An early answer',
    timestamp: '2026-08-01T00:00:01.000Z',
    metadata: { compaction: 'summarized' },
  },
  {
    id: 'assistant-summary',
    role: 'assistant',
    content: 'What the early turns covered',
    timestamp: '2026-08-01T00:00:02.000Z',
    metadata: { compaction: 'summary' },
  },
  {
    id: 'user-recent',
    role: 'user',
    content: 'A recent question',
    timestamp: '2026-08-01T00:00:03.000Z',
  },
  {
    id: 'assistant-recent',
    role: 'assistant',
    content: 'A recent answer',
    timestamp: '2026-08-01T00:00:04.000Z',
  },
];

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('[data-message-row]');
  if (!(row instanceof HTMLElement)) throw new Error(`no message row holds "${text}"`);
  return row;
}

describe('MessageList, messages compaction summarized', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    useChatStore.setState({
      activeConversationId: CONVERSATION_ID,
      messagesByConversation: { [CONVERSATION_ID]: messages },
      isStreaming: false,
    });
    render(
      <MessageList
        conversationId={CONVERSATION_ID}
        showProvenanceFooter={false}
        onRegenerateMessage={vi.fn()}
        onEditMessage={vi.fn()}
        messageActions={{ onBranch: vi.fn(), onReadAloud: vi.fn() }}
      />,
    );
  });

  afterEach(cleanup);

  it('marks a summarized message and its summary, and no other', () => {
    expect(
      screen.getAllByTestId('compaction-marker').map((marker) => marker.dataset['compaction']),
    ).toEqual(['summarized', 'summarized', 'summary']);
    expect(within(rowOf('A recent answer')).queryByTestId('compaction-marker')).toBeNull();
  });

  it('offers no retry, branch or edit on a summarized message or its summary', () => {
    for (const text of ['An early question', 'An early answer', 'What the early turns covered']) {
      const row = within(rowOf(text));
      expect(row.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(row.queryByRole('button', { name: 'Branch conversation from here' })).toBeNull();
      expect(row.queryByRole('button', { name: /edit/i })).toBeNull();
    }
    expect(
      within(rowOf('An early answer')).getByRole('button', { name: 'Read message aloud' }),
    ).not.toBeNull();
  });

  it('keeps retry, branch and edit on the messages the model still reads', () => {
    const reply = within(rowOf('A recent answer'));
    expect(reply.getByRole('button', { name: 'Retry' })).not.toBeNull();
    expect(reply.getByRole('button', { name: 'Branch conversation from here' })).not.toBeNull();
    expect(
      within(rowOf('A recent question')).getByRole('button', { name: /edit/i }),
    ).not.toBeNull();
  });
});
