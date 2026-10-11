import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import { useResearchPanelStore } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';
type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<UnifiedChatModule>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <span data-testid="markdown-content">{content}</span>
    ),
  };
});

const CONVERSATION_ID = 'conv-sources-button';
const MEMORIES = {
  count: 14,
  memories: [{ id: 'mem-1', excerpt: 'You are a solo founder of AGI Workforce' }],
};

function assistantMessage(metadata: Record<string, unknown>) {
  return {
    id: 'msg-sources',
    role: 'assistant' as const,
    content: 'Here is the plan.',
    timestamp: new Date('2026-10-10T12:00:00Z'),
    isStreaming: false,
    sessionId: CONVERSATION_ID,
    metadata: metadata as never,
  };
}

beforeEach(() => {
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  useResearchPanelStore.setState({
    panelOpen: false,
    messageId: null,
    cited: [],
    more: [],
    query: undefined,
    memories: null,
    conversationId: null,
  });
});

describe('MessageBubble sources action', () => {
  it('opens the Sources panel with the memories the answer used', () => {
    render(<MessageBubble message={assistantMessage({ memoryCitations: MEMORIES })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show sources' }));

    const state = useResearchPanelStore.getState();
    expect(state.panelOpen).toBe(true);
    expect(state.sourcesFor(CONVERSATION_ID)).toMatchObject({
      messageId: 'msg-sources',
      memories: MEMORIES,
      cited: [],
    });
  });

  it('lists memories in the panel, not as a second chip under the answer', () => {
    render(<MessageBubble message={assistantMessage({ memoryCitations: MEMORIES })} />);

    expect(screen.queryByText(/saved memor/i)).toBeNull();
    expect(screen.queryByText('You are a solo founder of AGI Workforce')).toBeNull();
  });

  it('opens the panel with web sources and memories together', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          tools: [{ name: 'web_search', status: 'completed' }],
          searchResults: [{ url: 'https://example.com/a', title: 'Example A' }],
          memoryCitations: MEMORIES,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show sources' }));

    const shown = useResearchPanelStore.getState().sourcesFor(CONVERSATION_ID);
    expect([...shown.cited, ...shown.more].map((source) => source.url)).toEqual([
      'https://example.com/a',
    ]);
    expect(shown.memories).toEqual(MEMORIES);
  });

  it('offers no Sources action when the answer used neither the web nor memory', () => {
    render(<MessageBubble message={assistantMessage({})} />);
    expect(screen.queryByRole('button', { name: 'Show sources' })).toBeNull();
  });
});
