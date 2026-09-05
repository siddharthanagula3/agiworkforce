import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, listCanonicalModels } from '@agiworkforce/types';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { toChatMessage } from '../pages/WebChatPage';
import { MessageBubble } from '../components/messages/MessageBubble';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@/lib/identity/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/identity/client')>();
  return {
    ...actual,
    useSession: () => ({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_test',
      getToken: authMocks.getToken,
    }),
  };
});

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({ ...headers, 'x-csrf-token': 'token' }),
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => <span>{content}</span>,
  };
});

const SUBSTITUTED_MODEL = (() => {
  const model = listCanonicalModels().find((candidate) =>
    ['chat', 'search', 'multimodal'].includes(candidate.modelType),
  );
  if (!model) throw new Error('Canonical chat fixture is missing');
  return model.id;
})();

const SUBSTITUTED_MODEL_NAME = (() => {
  const name = getModelMetadataById(SUBSTITUTED_MODEL)?.name;
  if (!name) throw new Error('Canonical chat fixture has no display name');
  return name;
})();

const CONVERSATION = {
  id: 'conv-fallback-reason',
  title: 'Temporary chat',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  isTemporary: true,
};

function mockStreamResponse(headers: Record<string, string>) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
        ),
      );
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(stream, { status: 200, headers: new Headers(headers) }),
  );
}

function bubbleMessage(fallbackReason?: string) {
  return {
    id: 'assistant-1',
    role: 'assistant' as const,
    content: 'answer',
    timestamp: new Date('2026-08-01T00:00:00.000Z'),
    isStreaming: false,
    metadata: { model: SUBSTITUTED_MODEL, ...(fallbackReason ? { fallbackReason } : {}) },
  };
}

describe('provider-outage / credit-downgrade fallback reason reaches the streaming client', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useChatStore.setState({ activeConversationId: CONVERSATION.id, conversations: [CONVERSATION] });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores the streamed X-AGI-Fallback-Reason on the assistant turn', async () => {
    mockStreamResponse({
      'X-AGI-Resolved-Model': SUBSTITUTED_MODEL,
      'X-AGI-Fallback-Reason': 'insufficient_credits',
    });
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('why did this switch models?', {
        conversationId: CONVERSATION.id,
      });
    });

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.fallbackReason).toBe('insufficient_credits');
  });

  it('leaves no fallback reason on a turn the server served normally', async () => {
    mockStreamResponse({ 'X-AGI-Resolved-Model': SUBSTITUTED_MODEL });
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('normal turn', { conversationId: CONVERSATION.id });
    });

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.fallbackReason).toBeUndefined();
  });

  it('projects the stored reason into the transcript message metadata', () => {
    const stored: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'answer',
      createdAt: '2026-08-01T00:00:00.000Z',
      model: SUBSTITUTED_MODEL,
      fallbackReason: 'managed_failover',
    };

    expect(toChatMessage(stored, CONVERSATION.id).metadata?.['fallbackReason']).toBe(
      'managed_failover',
    );
  });

  it('explains the substitution on the affected message and lets the reader dismiss it', () => {
    render(<MessageBubble message={bubbleMessage('managed_failover')} />);

    const notice = screen.getByTestId('fallback-reason-notice');
    expect(notice.textContent).toContain('was unavailable');
    expect(notice.textContent).toContain(SUBSTITUTED_MODEL_NAME);

    fireEvent.click(screen.getByRole('button', { name: /dismiss model substitution notice/i }));
    expect(screen.queryByTestId('fallback-reason-notice')).toBeNull();
  });

  it('shows no notice when the requested model served the turn', () => {
    render(<MessageBubble message={bubbleMessage()} />);

    expect(screen.queryByTestId('fallback-reason-notice')).toBeNull();
  });
});
