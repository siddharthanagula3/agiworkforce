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
import type { ChatMessage } from '@agiworkforce/unified-chat';

const ttsMock = vi.hoisted(() => {
  const state = { isSpeaking: false };
  const speak = vi.fn(() => {
    state.isSpeaking = true;
  });
  const stop = vi.fn(() => {
    state.isSpeaking = false;
  });
  return { state, speak, stop };
});

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

// jsdom doesn't implement scrollIntoView · mock it globally for all tests
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  ttsMock.state.isSpeaking = false;
  ttsMock.speak.mockClear();
  ttsMock.stop.mockClear();
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Silence framer-motion in jsdom · avoids CSS/animation timing issues
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
  // AUDIT-FIX GOV-33: the component now reads prefers-reduced-motion through
  // framer-motion so it can drop INLINE motion styles the global CSS reset
  // cannot reach. The mock must export it or every render throws.
  useReducedMotion: () => false,
}));

vi.mock('@/lib/hooks/useTTS', () => ({
  useTTS: () => ({
    isSpeaking: ttsMock.state.isSpeaking,
    isSupported: true,
    speak: ttsMock.speak,
    stop: ttsMock.stop,
  }),
}));

// MessageBubble renders content directly so we can assert on text
vi.mock('./MessageBubble', () => ({
  MessageBubble: ({
    message,
    onRegenerate,
    onDelete,
    onReadAloud,
    isReadingAloud,
    isReadAloudSupported,
  }: {
    message: {
      id: string;
      role: string;
      content: string;
      isStreaming?: boolean;
      attachments?: Array<{ name: string }>;
    };
    onRegenerate?: () => void;
    onDelete?: () => void;
    onReadAloud?: (messageId: string, content: string) => void;
    isReadingAloud?: boolean;
    isReadAloudSupported?: boolean;
  }) => (
    <div
      data-testid={`bubble-${message.id}`}
      data-role={message.role}
      data-attachments={message.attachments?.map((attachment) => attachment.name).join(',')}
    >
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
      {message.role === 'assistant' && isReadAloudSupported && onReadAloud && (
        <button
          onClick={() => onReadAloud(message.id, message.content)}
          aria-label={isReadingAloud ? `stop-${message.id}` : `read-${message.id}`}
        >
          {isReadingAloud ? 'stop' : 'read'}
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
    conversationId: 'conv-1',
    role: overrides.role,
    content: overrides.content,
    createdAt: '2026-01-01T12:00:00.000Z',
    isStreaming: overrides.isStreaming ?? false,
    attachments: overrides.attachments,
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

  it('forwards persisted attachments to the transcript bubble after reload', () => {
    const withAttachment = makeMessage({
      id: 'm-attachment',
      role: 'user',
      content: 'Read this',
      attachments: [
        {
          id: 'asset-1',
          name: 'report.pdf',
          type: 'file',
          size: 1024,
          url: '/api/files/asset-1',
          mimeType: 'application/pdf',
        } as ChatMessage['attachments'] extends Array<infer T> ? T : never,
      ],
    });

    render(<ChatMessageList messages={[withAttachment]} />);

    expect(screen.getByTestId('bubble-m-attachment')).toHaveAttribute(
      'data-attachments',
      'report.pdf',
    );
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

  /**
   * AUDIT-FIX GOV-29: this test previously asserted aria-live="polite" on the
   * SCROLL CONTAINER. That contract was the defect — it made the whole
   * transcript one live region, so unrelated content was re-announced on every
   * re-render and the streamed delta was never announced on its own. The
   * container is now an inert log that reports aria-busy, and a dedicated
   * off-screen status region carries the announcements.
   */
  it('silences the scroll container as a live region and reports busy state', () => {
    render(<ChatMessageList messages={messages} />);
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'off');
    expect(log).toHaveAttribute('aria-busy', 'false');
  });

  it('marks the scroll container busy while a response is generating', () => {
    render(<ChatMessageList messages={messages} isLoading={true} />);
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true');
  });

  it('announces generation start and completion in a dedicated status region', async () => {
    const streaming = [
      makeMessage({ id: 'u1', role: 'user', content: 'hi' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'partial', isStreaming: true }),
    ];
    const { rerender } = render(<ChatMessageList messages={streaming} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Generating response');
    });

    act(() => {
      rerender(
        <ChatMessageList
          messages={[
            makeMessage({ id: 'u1', role: 'user', content: 'hi' }),
            makeMessage({ id: 'a1', role: 'assistant', content: 'all done', isStreaming: false }),
          ]}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Response complete. all done');
    });
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

  it('owns one read-aloud controller and switches the active response', () => {
    const messages = [
      makeMessage({ id: 'msg-1', role: 'assistant', content: 'First response' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Second response' }),
    ];
    render(<ChatMessageList messages={messages} />);

    fireEvent.click(screen.getByRole('button', { name: 'read-msg-1' }));
    expect(ttsMock.speak).toHaveBeenCalledWith('First response');
    expect(screen.getByRole('button', { name: 'stop-msg-1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'read-msg-2' }));
    expect(ttsMock.speak).toHaveBeenLastCalledWith('Second response');
    expect(screen.getByRole('button', { name: 'stop-msg-2' })).toBeInTheDocument();
  });

  it('stops the response currently being read', () => {
    const messages = [makeMessage({ id: 'msg-1', role: 'assistant', content: 'Response' })];
    render(<ChatMessageList messages={messages} />);

    fireEvent.click(screen.getByRole('button', { name: 'read-msg-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'stop-msg-1' }));

    expect(ttsMock.stop).toHaveBeenCalledOnce();
    expect(ttsMock.speak).toHaveBeenCalledOnce();
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

// ---------------------------------------------------------------------------
// Continue Generation button (task #88)
// ---------------------------------------------------------------------------

describe('ChatMessageList Continue Generation', () => {
  const continueButton = () =>
    screen.queryByRole('button', { name: /continue generating this response/i });

  function truncatedThread(finishReason: string, content = 'partial answer') {
    return [
      makeMessage({ id: 'u1', role: 'user', content: 'write something long' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content,
        metadata: { finishReason },
      }),
    ];
  }

  it("shows Continue below a token-cap-truncated last assistant message (finish_reason 'length')", () => {
    render(<ChatMessageList messages={truncatedThread('length')} onContinue={vi.fn()} />);
    expect(continueButton()).toBeInTheDocument();
  });

  it("shows Continue for a user-stopped last message with partial content ('stopped')", () => {
    render(<ChatMessageList messages={truncatedThread('stopped')} onContinue={vi.fn()} />);
    expect(continueButton()).toBeInTheDocument();
  });

  it('calls onContinue with the last assistant message id', () => {
    const onContinue = vi.fn();
    render(<ChatMessageList messages={truncatedThread('max_tokens')} onContinue={onContinue} />);
    fireEvent.click(continueButton()!);
    expect(onContinue).toHaveBeenCalledWith('a1');
  });

  it('does NOT show Continue on a normally-completed turn', () => {
    render(<ChatMessageList messages={truncatedThread('stop')} onContinue={vi.fn()} />);
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('does NOT show Continue when there is no recorded finish reason', () => {
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'q' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'complete answer' }),
    ];
    render(<ChatMessageList messages={messages} onContinue={vi.fn()} />);
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('does NOT show Continue when the partial content is empty (no fake availability)', () => {
    render(<ChatMessageList messages={truncatedThread('stopped', '')} onContinue={vi.fn()} />);
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('does NOT show Continue when the truncated message is not the last one', () => {
    const messages = [
      ...truncatedThread('length'),
      makeMessage({ id: 'u2', role: 'user', content: 'never mind, new question' }),
    ];
    render(<ChatMessageList messages={messages} onContinue={vi.fn()} />);
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('does NOT show Continue while a request is in flight or while streaming', () => {
    const { rerender } = render(
      <ChatMessageList messages={truncatedThread('length')} onContinue={vi.fn()} isLoading />,
    );
    expect(continueButton()).not.toBeInTheDocument();

    const streaming = [
      makeMessage({ id: 'u1', role: 'user', content: 'q' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        isStreaming: true,
        metadata: { finishReason: 'length' },
      }),
    ];
    rerender(<ChatMessageList messages={streaming} onContinue={vi.fn()} />);
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('does NOT render the affordance when the surface has not opted in (no onContinue)', () => {
    render(<ChatMessageList messages={truncatedThread('length')} />);
    expect(continueButton()).not.toBeInTheDocument();
  });
});

describe('ChatMessageList stream error notice', () => {
  const retryButton = () => screen.queryByRole('button', { name: /regenerate this response/i });
  // Matches both the fallback copy ("This response may be incomplete — ...")
  // and the enriched copy ("Response may be incomplete: <classified message>").
  const noticeText = () => screen.queryByText(/response may be incomplete/i);

  function streamErrorThread(streamError: string | undefined, content = 'partial answer') {
    return [
      makeMessage({ id: 'u1', role: 'user', content: 'write something long' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content,
        metadata: streamError ? { streamError } : undefined,
      }),
    ];
  }

  it('shows the incomplete-response notice + retry when the last assistant message has metadata.streamError', () => {
    render(
      <ChatMessageList
        messages={streamErrorThread('Anthropic API overloaded')}
        onRegenerate={vi.fn()}
      />,
    );
    expect(noticeText()).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it('calls onRegenerate with the last assistant message id when Retry is clicked', () => {
    const onRegenerate = vi.fn();
    render(
      <ChatMessageList messages={streamErrorThread('rate limited')} onRegenerate={onRegenerate} />,
    );
    fireEvent.click(retryButton()!);
    expect(onRegenerate).toHaveBeenCalledWith('a1');
  });

  it('does NOT show the notice on a normally-completed turn (no streamError)', () => {
    render(<ChatMessageList messages={streamErrorThread(undefined)} onRegenerate={vi.fn()} />);
    expect(noticeText()).not.toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it('does NOT show the notice while a request is in flight or while streaming', () => {
    const { rerender } = render(
      <ChatMessageList messages={streamErrorThread('boom')} onRegenerate={vi.fn()} isLoading />,
    );
    expect(noticeText()).not.toBeInTheDocument();

    const streaming = [
      makeMessage({ id: 'u1', role: 'user', content: 'q' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        isStreaming: true,
        metadata: { streamError: 'boom' },
      }),
    ];
    rerender(<ChatMessageList messages={streaming} onRegenerate={vi.fn()} />);
    // hasStreamError itself doesn't check isStreaming (pure metadata read),
    // so showStreamErrorNotice guards on it explicitly — this message would
    // never realistically carry a terminal streamError while still
    // isStreaming, but the safety bar must hold regardless.
    expect(noticeText()).not.toBeInTheDocument();
  });

  it('does NOT render the affordance when the surface has not opted in (no onRegenerate)', () => {
    render(<ChatMessageList messages={streamErrorThread('boom')} />);
    expect(noticeText()).not.toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it('is mutually exclusive with Continue Generation (finishReason takes precedence)', () => {
    // A turn with BOTH a continuable finishReason and a streamError shouldn't
    // realistically happen (see the field's doc comment), but the notice
    // must not double up with Continue if it ever does.
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'q' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        metadata: { finishReason: 'length', streamError: 'boom' },
      }),
    ];
    render(<ChatMessageList messages={messages} onContinue={vi.fn()} onRegenerate={vi.fn()} />);
    const continueButton = screen.queryByRole('button', {
      name: /continue generating this response/i,
    });
    expect(continueButton).toBeInTheDocument();
    expect(noticeText()).not.toBeInTheDocument();
  });
});

describe('ChatMessageList safety refusal notice', () => {
  const refusalText = () => screen.queryByText(/declined to finish this response/i);
  const retryButton = () => screen.queryByRole('button', { name: /regenerate this response/i });
  const errorNoticeText = () => screen.queryByText(/response may be incomplete/i);

  function refusalThread(finishReason: string, content = 'I can') {
    return [
      makeMessage({ id: 'u1', role: 'user', content: 'q' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content,
        metadata: { finishReason },
      }),
    ];
  }

  it("shows the honest declined notice for finishReason 'refusal' (legacy web wire literal)", () => {
    render(<ChatMessageList messages={refusalThread('refusal')} onRegenerate={vi.fn()} />);
    expect(refusalText()).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });

  it("shows the notice for finishReason 'content_filter' (OpenAI wire vocabulary)", () => {
    render(<ChatMessageList messages={refusalThread('content_filter')} onRegenerate={vi.fn()} />);
    expect(refusalText()).toBeInTheDocument();
  });

  it('a refusal is never rendered as the generic stream-error notice', () => {
    render(<ChatMessageList messages={refusalThread('refusal')} onRegenerate={vi.fn()} />);
    expect(errorNoticeText()).not.toBeInTheDocument();
    expect(refusalText()).toBeInTheDocument();
  });

  it('a refusal is never a silent stop: the notice renders even without onRegenerate (Retry hidden)', () => {
    render(<ChatMessageList messages={refusalThread('refusal')} />);
    expect(refusalText()).toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it('calls onRegenerate with the refused message id when Retry is clicked', () => {
    const onRegenerate = vi.fn();
    render(<ChatMessageList messages={refusalThread('refusal')} onRegenerate={onRegenerate} />);
    fireEvent.click(retryButton()!);
    expect(onRegenerate).toHaveBeenCalledWith('a1');
  });

  it('does NOT show the notice on a normal completion or while streaming', () => {
    const { rerender } = render(
      <ChatMessageList messages={refusalThread('stop')} onRegenerate={vi.fn()} />,
    );
    expect(refusalText()).not.toBeInTheDocument();

    const streaming = [
      makeMessage({ id: 'u1', role: 'user', content: 'q' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content: 'partial',
        isStreaming: true,
        metadata: { finishReason: 'refusal' },
      }),
    ];
    rerender(<ChatMessageList messages={streaming} onRegenerate={vi.fn()} />);
    expect(refusalText()).not.toBeInTheDocument();
  });
});
