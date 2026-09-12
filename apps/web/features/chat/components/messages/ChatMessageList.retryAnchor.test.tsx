import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList, firstChangedGroupIndex, groupMessages } from './ChatMessageList';

const mockDynamicRowHeightKeys: Array<string | number | undefined> = [];
const mockSetRowHeightCalls: Array<{ index: number; size: number }> = [];

/**
 * A stable stand-in for react-window's measurement cache. The real one lives
 * behind a `key` that empties it, so these two collections are the only way to
 * see what this component asks it to forget.
 */
const mockRowHeightApi = {
  getAverageRowHeight: () => 160,
  getRowHeight: () => 160,
  setRowHeight: (index: number, size: number) => {
    mockSetRowHeightCalls.push({ index, size });
  },
  observeRowElements: () => () => {},
};

vi.mock('react-window', () => ({
  useDynamicRowHeight: ({ key }: { defaultRowHeight: number; key?: string | number }) => {
    mockDynamicRowHeightKeys.push(key);
    return mockRowHeightApi;
  },
  List: ({
    rowComponent: Row,
    rowCount,
    rowProps,
    listRef,
  }: {
    rowComponent: React.ComponentType<Record<string, unknown>>;
    rowCount: number;
    rowProps: Record<string, unknown>;
    listRef?: { current: unknown };
  }) => {
    if (listRef) listRef.current = { element: null, scrollToRow: () => {} };
    return (
      <div data-testid="virtual-list">
        {Array.from({ length: rowCount }, (_, index) => (
          <Row key={index} index={index} style={{}} ariaAttributes={{}} {...rowProps} />
        ))}
      </div>
    );
  },
}));

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}));

vi.mock('@/lib/hooks/useTTS', () => ({
  useTTS: () => ({ isSpeaking: false, isSupported: false, speak: vi.fn(), stop: vi.fn() }),
}));

vi.mock('./MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string; content: string } }) => (
    <div data-testid={`bubble-${message.id}`}>{message.content}</div>
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

/** Six alternating turns, so every message is a group and a row of its own. */
const LONG_PATH = [
  chatMessage('u1', 'one', 'user'),
  chatMessage('a1', 'first answer', 'assistant'),
  chatMessage('u2', 'two', 'user'),
  chatMessage('a2', 'second answer', 'assistant'),
  chatMessage('u3', 'three', 'user'),
  chatMessage('a3', 'third answer', 'assistant'),
];

const RETRIED_PATH = [
  ...LONG_PATH.slice(0, 5),
  chatMessage('a3-retry', 'third answer, again', 'assistant'),
];

describe('firstChangedGroupIndex', () => {
  const groupsOf = (messages: ChatMessage[]) => groupMessages(messages);

  /**
   * Retry swaps the answer for a sibling at the same position. Reporting the
   * whole transcript as changed here is what sent the reader to an unrelated
   * message (AGI-20): every row above the retried one still shows exactly what
   * it showed, so every row above it must keep its measured height.
   */
  it('reports only the row Retry rewrote', () => {
    expect(firstChangedGroupIndex(groupsOf(LONG_PATH), groupsOf(RETRIED_PATH))).toBe(5);
  });

  it('reports nothing when the next turn is appended below the transcript', () => {
    const appended = [...LONG_PATH, chatMessage('u4', 'four', 'user')];
    expect(firstChangedGroupIndex(groupsOf(LONG_PATH), groupsOf(appended))).toBe(-1);
  });

  /**
   * A streamed frame rewrites content, never identity. Treating it as a change
   * would re-measure the live answer on every chunk.
   */
  it('reports nothing when a streamed frame rewrites content but not identity', () => {
    const streamed = [
      ...LONG_PATH.slice(0, 5),
      chatMessage('a3', 'third answer, now longer', 'assistant'),
    ];
    expect(firstChangedGroupIndex(groupsOf(LONG_PATH), groupsOf(streamed))).toBe(-1);
  });

  /**
   * A group the streaming turn extends keeps a stale height, which is still a
   * far better estimate of a grown group than the default row height.
   */
  it('reports nothing when a group only gained a message', () => {
    const grown = [...LONG_PATH, chatMessage('a3b', 'and one more part', 'assistant')];
    expect(firstChangedGroupIndex(groupsOf(LONG_PATH), groupsOf(grown))).toBe(-1);
  });

  /** Retrying an earlier turn drops everything below it. */
  it('reports the first row past the end when the transcript got shorter', () => {
    expect(firstChangedGroupIndex(groupsOf(LONG_PATH), groupsOf(LONG_PATH.slice(0, 4)))).toBe(4);
  });

  it('reports nothing for two empty transcripts', () => {
    expect(firstChangedGroupIndex([], [])).toBe(-1);
  });
});

describe('ChatMessageList row-height invalidation on Retry', () => {
  beforeEach(() => {
    mockDynamicRowHeightKeys.length = 0;
    mockSetRowHeightCalls.length = 0;
  });

  /**
   * AGI-20. Retry used to bump the virtualization key, which empties
   * react-window's by-index height cache outright. Every row then fell back to
   * the default estimate, so in a long thread the reader's scroll offset
   * suddenly pointed at a completely different message, and the list scrolled
   * to a bottom it had computed hundreds of rows too high. The key must survive
   * a retry.
   */
  it('keeps the measurement cache when Retry replaces an answer', () => {
    const { rerender } = render(
      <ChatMessageList messages={LONG_PATH} conversationId="conv-1" activeLeafId="a3" />,
    );

    rerender(
      <ChatMessageList messages={RETRIED_PATH} conversationId="conv-1" activeLeafId="a3-retry" />,
    );

    expect(new Set(mockDynamicRowHeightKeys)).toEqual(new Set(['conv-1']));
  });

  /**
   * The rows that DID change meaning still have to be forgotten, or the new
   * answer is laid out at the old one's height. Row 0 is the top spacer, so the
   * sixth group is row 6: nothing below that index may be invalidated.
   */
  it('invalidates the retried row and nothing above it', () => {
    const { rerender } = render(
      <ChatMessageList messages={LONG_PATH} conversationId="conv-1" activeLeafId="a3" />,
    );
    expect(mockSetRowHeightCalls).toEqual([]);

    rerender(
      <ChatMessageList messages={RETRIED_PATH} conversationId="conv-1" activeLeafId="a3-retry" />,
    );

    expect(mockSetRowHeightCalls.map((call) => call.index)).toEqual([6, 7]);
  });

  it('invalidates nothing when the next turn is appended', () => {
    const { rerender } = render(
      <ChatMessageList messages={LONG_PATH} conversationId="conv-1" activeLeafId="a3" />,
    );

    rerender(
      <ChatMessageList
        messages={[...LONG_PATH, chatMessage('u4', 'four', 'user')]}
        conversationId="conv-1"
        activeLeafId="u4"
      />,
    );

    expect(mockSetRowHeightCalls).toEqual([]);
  });

  /**
   * A different transcript shares no row with this one, so the whole cache
   * still has to go. That is the one case the key is for.
   */
  it('throws the whole cache away when another conversation is opened', () => {
    const { rerender } = render(
      <ChatMessageList messages={LONG_PATH} conversationId="conv-1" activeLeafId="a3" />,
    );

    rerender(
      <ChatMessageList
        messages={[chatMessage('x1', 'elsewhere', 'user')]}
        conversationId="conv-2"
        activeLeafId="x1"
      />,
    );

    expect(new Set(mockDynamicRowHeightKeys)).toEqual(new Set(['conv-1', 'conv-2']));
  });
});
