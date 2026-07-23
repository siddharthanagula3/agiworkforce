import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { MessageList } from '../MessageList';

function seed(messages: ChatMessage[], isStreaming: boolean) {
  useChatStore.setState({
    messagesByConversation: { 'conversation-1': messages },
    isStreaming,
  } as never);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ messagesByConversation: {}, isStreaming: false } as never);
});

afterEach(() => cleanup());

describe('MessageList streaming status', () => {
  it('renders a visible shared Thinking status when the host bridge has not retained an empty assistant row', () => {
    seed(
      [
        {
          id: 'user-1',
          role: 'user',
          content: 'Calculate 6 × 7',
          createdAt: '2026-07-23T12:00:00.000Z',
        },
      ],
      true,
    );

    render(<MessageList conversationId="conversation-1" showProvenanceFooter={false} />);

    expect(screen.getByRole('status', { name: 'Assistant is thinking' }).textContent).toContain(
      'Thinking…',
    );
  });
});
