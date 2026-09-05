import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';
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

beforeEach(() => {
  window.HTMLElement.prototype.scrollTo = vi.fn(function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    const top = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
    Object.defineProperty(this, 'scrollTop', {
      configurable: true,
      writable: true,
      value: top,
    });
    this.dispatchEvent(new Event('scroll'));
  });
  ttsMock.state.isSpeaking = false;
  ttsMock.speak.mockClear();
  ttsMock.stop.mockClear();
});

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

vi.mock('./MessageBubble', () => ({
  MessageBubble: ({
    message,
    onRegenerate,
    onDelete,
    onReadAloud,
    isReadingAloud,
    isReadAloudSupported,
    onBranch,
    isBranching,
    branchNavigation,
    isLatestTurn,
    turnFailureReason,
    turnFailureActions,
  }: {
    message: {
      id: string;
      role: string;
      content: string;
      isStreaming?: boolean;
      attachments?: Array<{ name: string }>;
    };
    isLatestTurn?: boolean;
    turnFailureReason?: string;
    turnFailureActions?: React.ReactNode;
    onRegenerate?: () => void;
    onDelete?: () => void;
    onReadAloud?: (messageId: string, content: string) => void;
    isReadingAloud?: boolean;
    isReadAloudSupported?: boolean;
    onBranch?: () => void;
    isBranching?: boolean;
    branchNavigation?: {
      branches: Array<{ id: string }>;
      activeBranchId: string;
      onSwitch: (conversationId: string) => void;
    };
  }) => (
    <div
      data-testid={`bubble-${message.id}`}
      data-role={message.role}
      data-latest-turn={isLatestTurn ? 'true' : undefined}
      data-attachments={message.attachments?.map((attachment) => attachment.name).join(',')}
    >
      <span>{message.isStreaming && !message.content ? 'Thinking...' : message.content}</span>
      {turnFailureReason && (
        <div role="alert" data-testid="turn-failure-row">
          <span>{`Response failed: ${turnFailureReason}`}</span>
          {turnFailureActions}
        </div>
      )}
      <div data-testid="message-action-row" />
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
      {onBranch && (
        <button onClick={onBranch} disabled={isBranching} aria-label={`branch-${message.id}`}>
          branch
        </button>
      )}
      {branchNavigation && (
        <>
          <span data-testid={`branch-count-${message.id}`}>{branchNavigation.branches.length}</span>
          <button
            onClick={() => branchNavigation.onSwitch(branchNavigation.branches[1]!.id)}
            aria-label={`switch-branch-${message.id}`}
          >
            switch branch
          </button>
        </>
      )}
    </div>
  ),
}));

vi.mock('./TypingIndicator', () => ({
  TypingIndicator: () => <div data-testid="typing-indicator">Typing...</div>,
}));

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

  it('aligns follow-up suggestions to the composer content column when enabled', () => {
    const messagesWithSuggestions = [
      messages[0]!,
      makeMessage({
        id: 'm2',
        role: 'assistant',
        content: 'Here is a concrete plan with the next steps you can follow.',
      }),
    ];

    render(
      <ChatMessageList
        messages={messagesWithSuggestions}
        onSendMessage={vi.fn()}
        enableFollowUpSuggestions
      />,
    );

    expect(screen.getByTestId('follow-up-suggestions-shell')).toHaveClass(
      'mx-auto',
      'w-full',
      'max-w-3xl',
      'px-4',
    );
  });

  it('marks only the last assistant message as the latest turn', () => {
    const transcript = [
      makeMessage({ id: 'u1', role: 'user', content: 'First question' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'First answer' }),
      makeMessage({ id: 'u2', role: 'user', content: 'Second question' }),
      makeMessage({ id: 'a2', role: 'assistant', content: 'Second answer' }),
    ];

    render(<ChatMessageList messages={transcript} />);

    expect(screen.getByTestId('bubble-a1').hasAttribute('data-latest-turn')).toBe(false);
    expect(screen.getByTestId('bubble-u2').hasAttribute('data-latest-turn')).toBe(false);
    expect(screen.getByTestId('bubble-a2').getAttribute('data-latest-turn')).toBe('true');
  });

  it('drops the latest-turn flag from a reply once a newer turn arrives', () => {
    const firstTurn = [
      makeMessage({ id: 'u1', role: 'user', content: 'First question' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'First answer' }),
    ];

    const { rerender } = render(<ChatMessageList messages={firstTurn} />);
    expect(screen.getByTestId('bubble-a1').getAttribute('data-latest-turn')).toBe('true');

    rerender(
      <ChatMessageList
        messages={[
          ...firstTurn,
          makeMessage({ id: 'u2', role: 'user', content: 'Second question' }),
          makeMessage({ id: 'a2', role: 'assistant', content: 'Second answer' }),
        ]}
      />,
    );

    expect(screen.getByTestId('bubble-a1').hasAttribute('data-latest-turn')).toBe(false);
    expect(screen.getByTestId('bubble-a2').getAttribute('data-latest-turn')).toBe('true');
  });

  it('never marks a trailing user message as the latest turn', () => {
    const transcript = [
      makeMessage({ id: 'a1', role: 'assistant', content: 'Answer' }),
      makeMessage({ id: 'u2', role: 'user', content: 'Question' }),
    ];

    render(<ChatMessageList messages={transcript} />);

    expect(screen.getByTestId('bubble-a1').hasAttribute('data-latest-turn')).toBe(false);
    expect(screen.getByTestId('bubble-u2').hasAttribute('data-latest-turn')).toBe(false);
  });

  it('does not show follow-up suggestion chips by default', () => {
    const messagesWithSuggestions = [
      messages[0]!,
      makeMessage({
        id: 'm2',
        role: 'assistant',
        content: 'Here is a concrete plan with the next steps you can follow.',
      }),
    ];

    render(<ChatMessageList messages={messagesWithSuggestions} onSendMessage={vi.fn()} />);

    expect(screen.queryByTestId('follow-up-suggestions-shell')).toBeNull();
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

  it('announces cancellation instead of a successful completion', async () => {
    const streaming = [
      makeMessage({ id: 'u1', role: 'user', content: 'start a long response' }),
      makeMessage({ id: 'a1', role: 'assistant', content: '', isStreaming: true }),
    ];
    const { rerender } = render(<ChatMessageList messages={streaming} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Generating response');
    });

    act(() => {
      rerender(
        <ChatMessageList
          messages={[
            makeMessage({ id: 'u1', role: 'user', content: 'start a long response' }),
            makeMessage({
              id: 'a1',
              role: 'assistant',
              content: '',
              isStreaming: false,
              metadata: {
                agentActivity: {
                  schemaVersion: 1,
                  sessionId: 'conv-1',
                  turnId: 'a1',
                  lastSequence: -1,
                  status: 'cancelled',
                  startedAtMs: 1,
                  updatedAtMs: 2,
                  completedAtMs: 2,
                  entries: [],
                },
              },
            }),
          ]}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Response cancelled');
      expect(screen.getByRole('status')).not.toHaveTextContent('Response complete');
    });
  });
});

describe('ChatMessageList actions', () => {
  it('forwards the persisted billing recovery action instead of treating every refusal as upgrade', () => {
    const onPaywallUpgrade = vi.fn();
    const messages = [
      makeMessage({
        id: 'inactive-subscription',
        role: 'assistant',
        content: '',
        metadata: {
          paywall: {
            feature: 'video_generation',
            requiredTier: 'max_15x',
            reason: 'Your subscription is past_due. Please update your payment method.',
            recoveryAction: 'manage_billing',
          },
        },
      }),
    ];

    render(<ChatMessageList messages={messages} onPaywallUpgrade={onPaywallUpgrade} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }));

    expect(onPaywallUpgrade).toHaveBeenCalledWith(
      'inactive-subscription',
      'max_15x',
      'manage_billing',
    );
  });

  it('carries the exact persisted tier and account-aware usage destination', () => {
    const onPaywallUpgrade = vi.fn();
    const messages = [
      makeMessage({
        id: 'max-usage-exhausted',
        role: 'assistant',
        content: '\u200b',
        metadata: {
          paywall: {
            feature: 'token_cap',
            requiredTier: 'max_15x',
            reason: 'Your Max 15x usage for this billing period is used up.',
            recoveryAction: 'view_usage',
            showUpgradeCta: true,
          },
        },
      }),
    ];

    render(
      <ChatMessageList
        messages={messages}
        currentTier="max_15x"
        onPaywallUpgrade={onPaywallUpgrade}
      />,
    );
    expect(screen.queryByText('Upgrade to Max 15x', { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View usage' }));

    expect(onPaywallUpgrade).toHaveBeenCalledWith('max-usage-exhausted', 'max_15x', 'view_usage');
  });

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

  it('mounts branch creation and persisted branch navigation on the fork-point message', () => {
    const onBranch = vi.fn();
    const onSwitchBranch = vi.fn();
    const messages = [makeMessage({ id: 'fork-point', role: 'assistant', content: 'reply' })];

    render(
      <ChatMessageList
        messages={messages}
        branchGroupsByMessageId={{
          'fork-point': {
            messageId: 'fork-point',
            activeConversationId: 'conversation-main',
            branches: [
              { conversationId: 'conversation-main', title: 'Original' },
              { conversationId: 'conversation-branch', title: 'Alternative' },
            ],
          },
        }}
        onBranch={onBranch}
        onSwitchBranch={onSwitchBranch}
      />,
    );

    expect(screen.getByTestId('branch-count-fork-point')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'branch-fork-point' }));
    expect(onBranch).toHaveBeenCalledWith('fork-point');
    fireEvent.click(screen.getByRole('button', { name: 'switch-branch-fork-point' }));
    expect(onSwitchBranch).toHaveBeenCalledWith('conversation-branch');
  });

  it('disables branch creation only for the message currently being forked', () => {
    const messages = [
      makeMessage({ id: 'fork-point', role: 'assistant', content: 'reply' }),
      makeMessage({ id: 'other-message', role: 'assistant', content: 'other' }),
    ];

    render(
      <ChatMessageList messages={messages} branchingMessageId="fork-point" onBranch={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'branch-fork-point' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'branch-other-message' })).toBeEnabled();
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

describe('ChatMessageList auto-scroll', () => {
  it('scrolls to bottom when messages are first rendered', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [makeMessage({ id: '1', role: 'user', content: 'hi' })];
    render(<ChatMessageList messages={messages} />);

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalled();
    });
  });

  it('scrolls to bottom when new messages are added', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const initialMessages = [makeMessage({ id: '1', role: 'user', content: 'hi' })];
    const { rerender } = render(<ChatMessageList messages={initialMessages} />);

    const callsBefore = scrollTo.mock.calls.length;

    const updatedMessages = [
      ...initialMessages,
      makeMessage({ id: '2', role: 'assistant', content: 'hello' }),
    ];

    act(() => {
      rerender(<ChatMessageList messages={updatedMessages} />);
    });

    await waitFor(() => {
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('scrolls to bottom when streaming content grows', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: 's1', role: 'assistant', content: 'part 1', isStreaming: true }),
    ];
    const { rerender } = render(<ChatMessageList messages={messages} />);

    const callsBefore = scrollTo.mock.calls.length;

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
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('does not throw when the row count shrinks before a coalesced scroll fires', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      });

    const grownMessages = [
      makeMessage({ id: 'u1', role: 'user', content: 'first question' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'partial', isStreaming: true }),
    ];
    const shrunkMessages = [makeMessage({ id: 'u1', role: 'user', content: 'first question' })];

    const { rerender } = render(<ChatMessageList messages={grownMessages} />);
    expect(rafCallbacks.length).toBeGreaterThan(0);
    const pendingCallback = rafCallbacks[rafCallbacks.length - 1]!;

    act(() => {
      rerender(<ChatMessageList messages={shrunkMessages} />);
    });

    expect(() => {
      act(() => {
        pendingCallback(performance.now());
      });
    }).not.toThrow();

    rafSpy.mockRestore();
  });

  it('recycles a long transcript while keeping the newest history scroll-reachable', async () => {
    const messages = Array.from({ length: 120 }, (_, index) =>
      makeMessage({
        id: `long-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${index}`,
      }),
    );

    render(<ChatMessageList conversationId="long-thread" messages={messages} />);

    await waitFor(() => {
      expect(screen.getByTestId('bubble-long-119')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('bubble-long-0')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /show earlier messages/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid^="bubble-long-"]').length).toBeLessThan(30);
  });

  it('shows scroll-to-bottom button when user scrolls up', async () => {
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');

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

    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    Object.defineProperty(scrollContainer, 'scrollTop', { value: 700, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });
  });

  it('keeps tracking the bottom when the content grows under the returning scroll', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    const callsBefore = scrollTo.mock.calls.length;
    act(() => {
      fireEvent.click(screen.getByLabelText('Scroll to bottom'));
    });
    await waitFor(() => {
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    // The rows that were unmounted while the reader was away mount and measure
    // taller, so the scroll that just ran lands short of the real bottom.
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 700, configurable: true });
    act(() => {
      fireEvent.scroll(scrollContainer);
    });

    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();

    Object.defineProperty(scrollContainer, 'scrollTop', { value: 1300, configurable: true });
    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();

    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });
    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });
  });

  it('disengages follow-output on a user wheel scroll even while a programmatic catch-up scroll is still settling', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    const callsBefore = scrollTo.mock.calls.length;
    act(() => {
      fireEvent.click(screen.getByLabelText('Scroll to bottom'));
    });
    await waitFor(() => {
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 700, configurable: true });
    act(() => {
      fireEvent.wheel(scrollContainer);
      fireEvent.scroll(scrollContainer);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });
  });

  it('treats a scroll-relevant key as user intent but ignores an unrelated keypress', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    const callsBefore = scrollTo.mock.calls.length;
    act(() => {
      fireEvent.click(screen.getByLabelText('Scroll to bottom'));
    });
    await waitFor(() => {
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1600, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 700, configurable: true });
    act(() => {
      fireEvent.keyDown(scrollContainer, { key: 'a' });
      fireEvent.scroll(scrollContainer);
    });
    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(scrollContainer, { key: 'ArrowUp' });
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });
  });

  it('does not resume following after the reader scrolls up mid-stream, even as more content streams in', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const streamingMessage = makeMessage({
      id: 's1',
      role: 'assistant',
      content: 'part 1',
      isStreaming: true,
    });
    const { rerender } = render(<ChatMessageList messages={[streamingMessage]} />);

    const scrollContainer = screen.getByRole('log');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.wheel(scrollContainer);
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    const callsBefore = scrollTo.mock.calls.length;
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

    expect(scrollTo.mock.calls.length).toBe(callsBefore);
    expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
  });

  it('re-engages follow-output when the user sends a new message while scrolled up', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    const { rerender } = render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    const callsBefore = scrollTo.mock.calls.length;
    act(() => {
      rerender(
        <ChatMessageList
          messages={[...messages, makeMessage({ id: '3', role: 'user', content: 'follow-up' })]}
        />,
      );
    });

    await waitFor(() => {
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });
  });

  it('re-engages follow-output when the sent message and its assistant placeholder land in the same update', async () => {
    const scrollTo = window.HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>;
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'msg 1' }),
      makeMessage({ id: '2', role: 'assistant', content: 'msg 2' }),
    ];
    const { rerender } = render(<ChatMessageList messages={messages} />);

    const scrollContainer = screen.getByRole('log');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, configurable: true });

    act(() => {
      fireEvent.scroll(scrollContainer);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    });

    const callsBefore = scrollTo.mock.calls.length;
    act(() => {
      rerender(
        <ChatMessageList
          messages={[
            ...messages,
            makeMessage({ id: '3', role: 'user', content: 'follow-up' }),
            makeMessage({ id: '4', role: 'assistant', content: '', isStreaming: true }),
          ]}
        />,
      );
    });

    await waitFor(() => {
      expect(scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });
  });
});

describe('ChatMessageList message grouping', () => {
  it('renders grouped consecutive user messages in a single group', () => {
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'first' }),
      makeMessage({ id: 'u2', role: 'user', content: 'second' }),
    ];
    const { container } = render(<ChatMessageList messages={messages} />);

    const groups = container.querySelectorAll('.user-group');
    expect(groups).toHaveLength(1);

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

  it("shows the stopped notice, not Continue, for a user-stopped last message with partial content ('stopped')", () => {
    render(
      <ChatMessageList
        messages={truncatedThread('stopped')}
        onContinue={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(continueButton()).not.toBeInTheDocument();
    expect(screen.getByText('Response stopped.')).toBeInTheDocument();
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
  const noticeText = () => screen.queryByTestId('turn-failure-row');

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

  it('shows the failure row + retry when the last assistant message has metadata.streamError', () => {
    render(
      <ChatMessageList
        messages={streamErrorThread('the provider is overloaded')}
        onRegenerate={vi.fn()}
      />,
    );
    expect(noticeText()).toBeInTheDocument();
    expect(noticeText()!.textContent).toContain('Response failed: the provider is overloaded');
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
    // isStreaming, but the safety bar must hold regardless.
    expect(noticeText()).not.toBeInTheDocument();
  });

  it('does NOT render the affordance when the surface has not opted in (no onRegenerate)', () => {
    render(<ChatMessageList messages={streamErrorThread('boom')} />);
    expect(noticeText()).not.toBeInTheDocument();
    expect(retryButton()).not.toBeInTheDocument();
  });

  it('states the reason once, with no prefix, whether or not anything streamed', () => {
    const { rerender } = render(
      <ChatMessageList
        messages={streamErrorThread('The provider rejected this request.', '')}
        onRegenerate={vi.fn()}
      />,
    );

    expect(noticeText()!.textContent).toContain(
      'Response failed: The provider rejected this request.',
    );
    expect(retryButton()).toBeInTheDocument();

    rerender(
      <ChatMessageList
        messages={streamErrorThread('The provider rejected this request.', 'half an answer')}
        onRegenerate={vi.fn()}
      />,
    );

    expect(noticeText()!.textContent).toContain(
      'Response failed: The provider rejected this request.',
    );
    expect(screen.queryByText(/no response was returned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/response may be incomplete/i)).not.toBeInTheDocument();
  });

  function streamErrorCodeThread(code: string) {
    return [
      makeMessage({ id: 'u1', role: 'user', content: 'write something long' }),
      makeMessage({
        id: 'a1',
        role: 'assistant',
        content: 'partial answer',
        metadata: { streamError: { code, message: 'boom' } },
      }),
    ];
  }

  const switchModelButton = () => screen.queryByRole('button', { name: /open the model picker/i });

  it.each(['provider_unreachable', 'provider_error', 'model_not_found'])(
    'offers Switch model for the %s stream error code',
    (code) => {
      render(<ChatMessageList messages={streamErrorCodeThread(code)} onRegenerate={vi.fn()} />);
      expect(switchModelButton()).toBeInTheDocument();
    },
  );

  it('does NOT offer Switch model for a plain client_error stream error code', () => {
    render(
      <ChatMessageList
        messages={streamErrorCodeThread('provider_rejected_request')}
        onRegenerate={vi.fn()}
      />,
    );
    expect(switchModelButton()).not.toBeInTheDocument();
  });

  it('carries the reason on one row inside the assistant turn, not a banner below it', () => {
    render(
      <ChatMessageList messages={streamErrorCodeThread('provider_error')} onRegenerate={vi.fn()} />,
    );

    const rows = screen.getAllByTestId('turn-failure-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('Response failed: boom');
    expect(rows[0]!.textContent).not.toContain('No response was returned');
    const actionRow = screen.getAllByTestId('message-action-row').at(-1);
    expect(actionRow).toBeTruthy();
    expect(rows[0]!.compareDocumentPosition(actionRow!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('button', { name: /regenerate this response/i })).toBeInTheDocument();
  });

  it('opens the model picker from the failure row', () => {
    const trigger = document.createElement('button');
    trigger.id = 'model-selector';
    const clicked = vi.fn();
    trigger.addEventListener('click', clicked);
    document.body.appendChild(trigger);
    try {
      render(
        <ChatMessageList
          messages={streamErrorCodeThread('provider_error')}
          onRegenerate={vi.fn()}
        />,
      );
      fireEvent.click(switchModelButton()!);
      expect(clicked).toHaveBeenCalledTimes(1);
    } finally {
      trigger.remove();
    }
  });

  it('is mutually exclusive with Continue Generation (finishReason takes precedence)', () => {
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
    expect(screen.getByRole('button', { name: 'Report issue' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Report issue' })).toBeInTheDocument();
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
