import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const CONVERSATION = {
  id: 'conv-secret-redaction',
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

function bubbleMessage(secretRedactionCount?: number) {
  return {
    id: 'assistant-1',
    role: 'assistant' as const,
    content: 'answer',
    timestamp: new Date('2026-08-01T00:00:00.000Z'),
    isStreaming: false,
    metadata: { ...(secretRedactionCount ? { secretRedactionCount } : {}) },
  };
}

describe('secret redaction count reaches the streaming client', () => {
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

  it('stores the streamed X-AGI-Secret-Redaction-Count on the assistant turn', async () => {
    mockStreamResponse({ 'X-AGI-Secret-Redaction-Count': '2' });
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('here is my api key sk-abc', {
        conversationId: CONVERSATION.id,
      });
    });

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.secretRedactionCount).toBe(2);
  });

  it('leaves no redaction count on a turn nothing was removed from', async () => {
    mockStreamResponse({});
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('normal turn', { conversationId: CONVERSATION.id });
    });

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.secretRedactionCount).toBeUndefined();
  });

  it('projects the stored count into the transcript message metadata', () => {
    const stored: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'answer',
      createdAt: '2026-08-01T00:00:00.000Z',
      secretRedactionCount: 3,
    };

    expect(toChatMessage(stored, CONVERSATION.id).metadata?.['secretRedactionCount']).toBe(3);
  });

  it('explains the redaction on the affected message and lets the reader dismiss it', () => {
    render(<MessageBubble message={bubbleMessage(2)} />);

    const notice = screen.getByTestId('secret-redaction-notice');
    expect(notice.textContent).toContain('2 secrets were removed');

    fireEvent.click(screen.getByRole('button', { name: /dismiss secret redaction notice/i }));
    expect(screen.queryByTestId('secret-redaction-notice')).toBeNull();
  });

  it('shows no notice when nothing was redacted', () => {
    render(<MessageBubble message={bubbleMessage()} />);

    expect(screen.queryByTestId('secret-redaction-notice')).toBeNull();
  });
});
