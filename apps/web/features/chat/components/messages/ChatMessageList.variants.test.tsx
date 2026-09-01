import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList, isPathReRooted } from './ChatMessageList';
import type { VariantInfoByMessageId } from '@/features/chat/lib/messageThread';

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}));

vi.mock('@/lib/hooks/useTTS', () => ({
  useTTS: () => ({ isSpeaking: false, isSupported: false, speak: vi.fn(), stop: vi.fn() }),
}));

vi.mock('./MessageBubble', () => ({
  MessageBubble: ({
    message,
    variantInfo,
    onSelectVariant,
    isConversationStreaming,
  }: {
    message: { id: string; role: string; content: string };
    variantInfo?: { index: number; total: number; previousId: string | null };
    onSelectVariant?: (messageId: string) => void;
    isConversationStreaming?: boolean;
  }) => (
    <div data-testid={`bubble-${message.id}`}>
      <span>{message.content}</span>
      {variantInfo && (
        <>
          <span data-testid={`variants-${message.id}`}>
            {variantInfo.index + 1}/{variantInfo.total}
          </span>
          <button
            type="button"
            disabled={isConversationStreaming}
            aria-label={`previous-${message.id}`}
            onClick={() => onSelectVariant?.(variantInfo.previousId ?? '')}
          >
            previous
          </button>
        </>
      )}
    </div>
  ),
}));

vi.mock('./TypingIndicator', () => ({
  TypingIndicator: () => <div data-testid="typing-indicator" />,
}));

const BASE_TIME = Date.parse('2026-09-01T10:00:00.000Z');

function chatMessage(id: string, content: string, role: 'user' | 'assistant'): ChatMessage {
  return {
    id,
    role,
    content,
    createdAt: new Date(BASE_TIME),
  } as unknown as ChatMessage;
}

const VISIBLE_PATH = [
  chatMessage('u1', 'what is the capital of france', 'user'),
  chatMessage('a1', 'Paris.', 'assistant'),
];

const VARIANT_INFO: VariantInfoByMessageId = Object.freeze({
  a1: { index: 0, total: 2, previousId: null, nextId: 'a1b' },
});

describe('isPathReRooted', () => {
  const a = chatMessage('a', 'a', 'user');
  const b = chatMessage('b', 'b', 'assistant');
  const c = chatMessage('c', 'c', 'user');

  /**
   * The height cache is keyed by index with no partial invalidation, so this
   * predicate decides between "throw the whole thing away" and "keep it".
   */
  it('says no when the next turn is appended, which changes no existing index', () => {
    expect(isPathReRooted([a, b], [a, b, c])).toBe(false);
  });

  it('says no when a streamed frame rewrites content but not identity', () => {
    expect(isPathReRooted([a, b], [a, { ...b, content: 'Paris, France.' }])).toBe(false);
  });

  it('says yes when an index now holds a different message', () => {
    expect(isPathReRooted([a, b], [a, c])).toBe(true);
  });

  it('says yes when the path got shorter', () => {
    expect(isPathReRooted([a, b, c], [a, b])).toBe(true);
  });

  it('says no for two empty transcripts', () => {
    expect(isPathReRooted([], [])).toBe(false);
  });
});

describe('ChatMessageList variant plumbing', () => {
  it('hands each visible message its own pager state', () => {
    render(
      <ChatMessageList
        messages={VISIBLE_PATH}
        conversationId="conv-1"
        variantInfoByMessageId={VARIANT_INFO}
        onSelectVariant={vi.fn()}
        activeLeafId="a1"
      />,
    );

    expect(screen.getByTestId('variants-a1')).toHaveTextContent('1/2');
    expect(screen.queryByTestId('variants-u1')).not.toBeInTheDocument();
  });

  it('carries the selection back up to the page', async () => {
    const user = userEvent.setup();
    const onSelectVariant = vi.fn();
    render(
      <ChatMessageList
        messages={VISIBLE_PATH}
        conversationId="conv-1"
        variantInfoByMessageId={{
          a1: { index: 1, total: 2, previousId: 'a1-first', nextId: null },
        }}
        onSelectVariant={onSelectVariant}
        activeLeafId="a1"
      />,
    );

    await user.click(screen.getByLabelText('previous-a1'));

    expect(onSelectVariant).toHaveBeenCalledWith('a1-first');
  });

  it('passes the streaming state that disables paging mid-turn', () => {
    render(
      <ChatMessageList
        messages={VISIBLE_PATH}
        conversationId="conv-1"
        variantInfoByMessageId={VARIANT_INFO}
        onSelectVariant={vi.fn()}
        activeLeafId="a1"
        isConversationStreaming
      />,
    );

    expect(screen.getByLabelText('previous-a1')).toBeDisabled();
  });

  it('renders a conversation with no variants exactly as it did before', () => {
    render(<ChatMessageList messages={VISIBLE_PATH} conversationId="conv-1" />);

    expect(screen.getByTestId('bubble-u1')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-a1')).toBeInTheDocument();
    expect(screen.queryByTestId('variants-a1')).not.toBeInTheDocument();
  });

  it('swaps the rendered transcript when the leaf moves to the other variant', () => {
    const { rerender } = render(
      <ChatMessageList
        messages={VISIBLE_PATH}
        conversationId="conv-1"
        variantInfoByMessageId={VARIANT_INFO}
        onSelectVariant={vi.fn()}
        activeLeafId="a1"
      />,
    );

    rerender(
      <ChatMessageList
        messages={[VISIBLE_PATH[0]!, chatMessage('a1b', 'PARIS, OBVIOUSLY.', 'assistant')]}
        conversationId="conv-1"
        variantInfoByMessageId={{
          a1b: { index: 1, total: 2, previousId: 'a1', nextId: null },
        }}
        onSelectVariant={vi.fn()}
        activeLeafId="a1b"
        variantAnchorMessageId="a1b"
      />,
    );

    expect(screen.getByTestId('bubble-a1b')).toBeInTheDocument();
    expect(screen.queryByTestId('bubble-a1')).not.toBeInTheDocument();
  });
});
