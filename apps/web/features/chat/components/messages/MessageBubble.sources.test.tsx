import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import { useResearchPanelStore } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';
type UseChatStreamModule = typeof import('@/lib/hooks/useChatStream');

vi.mock('@/lib/hooks/useChatStream', async (importOriginal) => ({
  ...(await importOriginal<UseChatStreamModule>()),
  isApprovalTurnLive: () => true,
}));

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
const PENDING_APPROVAL = {
  schemaVersion: 1 as const,
  runId: 'b1050031-36da-489f-ae19-3e0d3f79be43',
  calls: [{ toolCallId: 'sources-approval-call', name: 'web_search' }],
};
const PARTIAL_NOTICE =
  'Waiting for approval. This response is partial; review the tool request to continue.';
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

afterEach(cleanup);

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

describe('MessageBubble paused approval presentation', () => {
  it('keeps partial prose and sources inspectable without ordinary regeneration', () => {
    const onRegenerate = vi.fn();
    render(
      <MessageBubble
        message={assistantMessage({
          cloudApproval: PENDING_APPROVAL,
          searchResults: [{ url: 'https://example.com/partial', title: 'Partial source' }],
        })}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.getByText('Here is the plan.')).toBeInTheDocument();
    expect(screen.getByText(PARTIAL_NOTICE)).toBeInTheDocument();
    expect(screen.getByText('Sources so far')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show sources' }));
    const shown = useResearchPanelStore.getState().sourcesFor(CONVERSATION_ID);
    expect([...shown.cited, ...shown.more].map((source) => source.url)).toEqual([
      'https://example.com/partial',
    ]);
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('rerenders a metadata-only decision and restores ordinary actions', () => {
    const onRegenerate = vi.fn();
    const original = assistantMessage({ cloudApproval: PENDING_APPROVAL });
    const rendered = render(<MessageBubble message={original} onRegenerate={onRegenerate} />);
    expect(screen.getByText(PARTIAL_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();

    rendered.rerender(
      <MessageBubble
        message={{
          ...original,
          metadata: {
            cloudApproval: {
              ...PENDING_APPROVAL,
              calls: PENDING_APPROVAL.calls.map((call) => ({
                ...call,
                approvalDecision: 'approved' as const,
              })),
            },
          },
        }}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.queryByText(PARTIAL_NOTICE)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate response' }));
    expect(onRegenerate).toHaveBeenCalledExactlyOnceWith(original.id);
  });

  it('recognizes a legacy pending tool without a cloud projection', () => {
    render(
      <MessageBubble
        message={assistantMessage({
          tools: [
            {
              name: 'web_search',
              toolCallId: 'legacy-approval-call',
              status: 'awaiting_approval',
              requiresApproval: true,
            },
          ],
        })}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.getByText(PARTIAL_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
  });

  it('defers the search notice for projection-only approval until the projection is removed', () => {
    const onRegenerate = vi.fn();
    const searchMetadata = { webSearchRequested: true, webSearchAskedInText: true };
    const original = assistantMessage({ ...searchMetadata, cloudApproval: PENDING_APPROVAL });
    const rendered = render(<MessageBubble message={original} onRegenerate={onRegenerate} />);

    expect(screen.getByText(PARTIAL_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(/model's own knowledge/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Send this turn again with a web search required' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();

    rendered.rerender(
      <MessageBubble
        message={{ ...original, metadata: searchMetadata }}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.queryByText(PARTIAL_NOTICE)).toBeNull();
    expect(screen.getByText(/model's own knowledge/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Send this turn again with a web search required' }),
    );
    expect(onRegenerate).toHaveBeenCalledExactlyOnceWith(original.id);
    expect(screen.getByRole('button', { name: 'Regenerate response' })).toBeInTheDocument();
  });
});
