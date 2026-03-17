/**
 * ChatMessageList tests
 *
 * Covers:
 * - groupMessages() pure helper (message grouping logic)
 * - Auto-scroll behavior (new messages, streaming updates)
 * - User scroll detection (pauses auto-scroll when user scrolls up)
 * - Message rendering (user + assistant, streaming indicator)
 * - Typing indicator visibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ChatMessageList, groupMessages } from './ChatMessageList';
import type { ChatMessage } from '../../stores/chat-store';

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

// jsdom doesn't implement scrollIntoView — mock it globally for all tests
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Silence framer-motion in jsdom — avoids CSS/animation timing issues
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// MessageBubble renders content directly so we can assert on text
vi.mock('./MessageBubble', () => ({
  MessageBubble: ({
    message,
    onRegenerate,
    onDelete,
  }: {
    message: { id: string; role: string; content: string; isStreaming?: boolean };
    onRegenerate?: () => void;
    onDelete?: () => void;
  }) => (
    <div data-testid={`bubble-${message.id}`} data-role={message.role}>
      <span>{message.isStreaming && !message.content ? 'Thinking...' : message.content}</span>
      {onRegenerate && (
        <button onClick={onRegenerate} aria-label="regenerate">
          regenerate
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} aria-label="delete">
          delete
        </button>
      )}
    </div>
  ),
}));

vi.mock('./TypingIndicator', () => ({
  TypingIndicator: () => <div data-testid="typing-indicator">Typing...</div>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'content'>,
): ChatMessage {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    role: overrides.role,
    content: overrides.content,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    isStreaming: overrides.isStreaming ?? false,
    metadata: overrides.metadata,
  };
}

// ---------------------------------------------------------------------------
// groupMessages() pure helper tests
// ---------------------------------------------------------------------------

describe('groupMessages()', () => {
  it('returns empty array for empty input', () => {
    expect(groupMessages([])).toEqual([]);
  });

  it('puts a single message in its own group', () => {
    const msgs = [makeMessage({ id: '1', role: 'user', content: 'hi' })];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.role).toBe('user');
    expect(groups[0]!.messages).toHaveLength(1);
    expect(groups[0]!.firstId).toBe('1');
  });

  it('groups consecutive messages from the same role', () => {
    const msgs = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'user', content: 'msg 2' }),
      makeMessage({ id: '3', role: 'assistant', content: 'reply' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.role).toBe('user');
    expect(groups[0]!.messages).toHaveLength(2);
    expect(groups[1]!.role).toBe('assistant');
    expect(groups[1]!.messages).toHaveLength(1);
  });

  it('creates a new group when role alternates', () => {
    const msgs = [
      makeMessage({ id: '1', role: 'user', content: 'a' }),
      makeMessage({ id: '2', role: 'assistant', content: 'b' }),
      makeMessage({ id: '3', role: 'user', content: 'c' }),
      makeMessage({ id: '4', role: 'assistant', content: 'd' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('treats consecutive same-role messages correctly regardless of count', () => {
    const msgs = [
      makeMessage({ id: '1', role: 'assistant', content: 'a' }),
      makeMessage({ id: '2', role: 'assistant', content: 'b' }),
      makeMessage({ id: '3', role: 'assistant', content: 'c' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.messages).toHaveLength(3);
  });

  it('preserves firstId as the id of the first message in each group', () => {
    const msgs = [
      makeMessage({ id: 'first', role: 'user', content: 'a' }),
      makeMessage({ id: 'second', role: 'user', content: 'b' }),
    ];
    const groups = groupMessages(msgs);
    expect(groups[0]!.firstId).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// ChatMessageList rendering tests
// ---------------------------------------------------------------------------

describe('ChatMessageList rendering', () => {
  const messages = [
    makeMessage({ id: 'm1', role: 'user', content: 'Hello' }),
    makeMessage({ id: 'm2', role: 'assistant', content: 'Hi there' }),
  ];

  it('renders all messages', () => {
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByTestId('bubble-m1')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-m2')).toBeInTheDocument();
  });

  it('renders message content text', () => {
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('renders empty state without error when messages is empty', () => {
    const { container } = render(<ChatMessageList messages={[]} />);
    expect(container.querySelector('[data-testid="chat-message-list"]')).toBeInTheDocument();
  });

  it('does not show typing indicator when not loading', () => {
    render(<ChatMessageList messages={messages} isLoading={false} />);
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
  });

  it('shows typing indicator when isLoading and last message is not streaming', () => {
    render(<ChatMessageList messages={messages} isLoading={true} />);
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });

  it('does not show typing indicator when last message is streaming', () => {
    const streamingMessages = [
      ...messages.slice(0, -1),
      makeMessage({ id: 'm2', role: 'assistant', content: '', isStreaming: true }),
    ];
    render(<ChatMessageList messages={streamingMessages} isLoading={true} />);
    expect(screen.queryByTestId('typing-indicator')).not.toBeInTheDocument();
  });

  it('has aria role="log" on the scroll container', () => {
    render(<ChatMessageList messages={messages} />);
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('has aria-live="polite" on the scroll container', () => {
    render(<ChatMessageList messages={messages} />);
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
  });
});

// ---------------------------------------------------------------------------
// Message actions callback tests
// ---------------------------------------------------------------------------

describe('ChatMessageList actions', () => {
  it('calls onDelete with correct messageId', () => {
    const onDelete = vi.fn();
    const messages = [makeMessage({ id: 'msg-1', role: 'assistant', content: 'text' })];
    render(<ChatMessageList messages={messages} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    expect(onDelete).toHaveBeenCalledWith('msg-1');
  });

  it('calls onRegenerate with correct messageId for assistant messages', () => {
    const onRegenerate = vi.fn();
    const messages = [makeMessage({ id: 'msg-2', role: 'assistant', content: 'reply' })];
    render(<ChatMessageList messages={messages} onRegenerate={onRegenerate} />);

    fireEvent.click(screen.getByRole('button', { name: 'regenerate' }));
    expect(onRegenerate).toHaveBeenCalledWith('msg-2');
  });
});

// ---------------------------------------------------------------------------
// Auto-scroll tests
// ---------------------------------------------------------------------------

describe('ChatMessageList auto-scroll', () => {
  it('scrolls to bottom when messages are first rendered', async () => {
    const scrollIntoView = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const messages = [makeMessage({ id: '1', role: 'user', content: 'hi' })];
    render(<ChatMessageList messages={messages} />);

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  it('scrolls to bottom when new messages are added', async () => {
    const scrollIntoView = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const initialMessages = [makeMessage({ id: '1', role: 'user', content: 'hi' })];
    const { rerender } = render(<ChatMessageList messages={initialMessages} />);

    const callsBefore = scrollIntoView.mock.calls.length;

    const updatedMessages = [
      ...initialMessages,
      makeMessage({ id: '2', role: 'assistant', content: 'hello' }),
    ];

    act(() => {
      rerender(<ChatMessageList messages={updatedMessages} />);
    });

    await waitFor(() => {
      expect(scrollIntoView.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('scrolls to bottom when streaming content grows', async () => {
    const scrollIntoView = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: 's1', role: 'assistant', content: 'part 1', isStreaming: true }),
    ];
    const { rerender } = render(<ChatMessageList messages={messages} />);

    const callsBefore = scrollIntoView.mock.calls.length;

    act(() => {
      rerender(
        <ChatMessageList
          messages={[
            makeMessage({
              id: 's1',
              role: 'assistant',
              content: 'part 1 more content',
              isStreaming: true,
            }),
          ]}
        />,
      );
    });

    await waitFor(() => {
      expect(scrollIntoView.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('shows scroll-to-bottom button when user scrolls up', async () => {
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');

    // Simulate scrolling up: scrollTop well away from bottom
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });
  });

  it('hides scroll-to-bottom button when user is near the bottom', async () => {
    const messages = [makeMessage({ id: '1', role: 'user', content: 'msg 1' })];
    render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');

    // First scroll up to show button
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    // Now scroll back to bottom
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 700, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Message grouping integration tests
// ---------------------------------------------------------------------------

describe('ChatMessageList message grouping', () => {
  it('renders grouped consecutive user messages in a single group', () => {
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'first' }),
      makeMessage({ id: 'u2', role: 'user', content: 'second' }),
    ];
    const { container } = render(<ChatMessageList messages={messages} />);

    const groups = container.querySelectorAll('.user-group');
    expect(groups).toHaveLength(1);

    // Both messages should be present
    expect(screen.getByTestId('bubble-u1')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-u2')).toBeInTheDocument();
  });

  it('renders separate groups when roles alternate', () => {
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'question' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'answer' }),
      makeMessage({ id: 'u2', role: 'user', content: 'follow up' }),
    ];
    const { container } = render(<ChatMessageList messages={messages} />);

    const userGroups = container.querySelectorAll('.user-group');
    const assistantGroups = container.querySelectorAll('.assistant-group');

    expect(userGroups).toHaveLength(2);
    expect(assistantGroups).toHaveLength(1);
  });
});
