import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, listCanonicalModels } from '@agiworkforce/types';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { toChatMessage } from '../pages/WebChatPage';
import { MessageBubble } from '../components/messages/MessageBubble';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clerk/nextjs')>();
  return { ...actual, useAuth: () => ({ getToken: authMocks.getToken }) };
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

const POOL_MODEL = (() => {
  const model = listCanonicalModels().find((candidate) =>
    ['chat', 'search', 'multimodal'].includes(candidate.modelType),
  );
  if (!model) throw new Error('Canonical chat fixture is missing');
  return model.id;
})();

const POOL_MODEL_NAME = (() => {
  const name = getModelMetadataById(POOL_MODEL)?.name;
  if (!name) throw new Error('Canonical chat fixture has no display name');
  return name;
})();

const CONVERSATION = {
  id: 'conv-free-lane',
  title: 'Temporary chat',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isTemporary: true,
};

const SERVER_MESSAGE =
  'No free capacity right now. Try again shortly, upgrade your plan, or use your own provider key.';
const RETRY_AT = '2026-09-01T12:00:45.000Z';

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

/** The exact body `buildFreeCapacityUnavailableResponse` writes. */
function mockStrandedResponse(options: { retryAt?: string } = {}) {
  const body = {
    error: {
      message: SERVER_MESSAGE,
      type: 'insufficient_quota',
      code: 'free_capacity_unavailable',
      ...(options.retryAt ? { retry_at: options.retryAt } : {}),
      recovery: [
        { action: 'upgrade', href: '/pricing' },
        { action: 'byok', href: '/byok' },
      ],
    },
  };
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 429,
      headers: new Headers({ 'Content-Type': 'application/json' }),
    }),
  );
}

async function sendOneTurn(prompt: string) {
  const { result } = renderHook(() => useChatStream());
  await act(async () => {
    await result.current.sendMessage(prompt, { conversationId: CONVERSATION.id });
  });
  return useChatStore.getState().messages.find((m) => m.role === 'assistant');
}

function bubbleMessage(routeLane?: string) {
  return {
    id: 'assistant-1',
    role: 'assistant' as const,
    content: 'answer',
    timestamp: new Date('2026-09-01T00:00:00.000Z'),
    isStreaming: false,
    metadata: { model: POOL_MODEL, ...(routeLane ? { routeLane } : {}) },
  };
}

describe('stranded free capacity reaches the streaming client', () => {
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

  it('turns the 429 into a free-capacity slot rather than an error transcript', async () => {
    mockStrandedResponse({ retryAt: RETRY_AT });

    const assistant = await sendOneTurn('anything');

    expect(assistant?.error).toBe(false);
    expect(assistant?.metadata?.paywall?.freeCapacity).toEqual({
      retryAt: RETRY_AT,
      byokHref: '/byok',
    });
    expect(assistant?.metadata?.paywall?.reason).toBe(SERVER_MESSAGE);
  });

  it('reads the byok destination out of the recovery LIST the free lane sends', async () => {
    mockStrandedResponse({ retryAt: RETRY_AT });

    const assistant = await sendOneTurn('anything');

    expect(assistant?.metadata?.paywall?.freeCapacity?.byokHref).toBe('/byok');
    expect(assistant?.metadata?.paywall?.recoveryAction).toBe('upgrade');
  });

  it('carries no retry instant when the server named none', async () => {
    mockStrandedResponse();

    const assistant = await sendOneTurn('anything');

    expect(assistant?.metadata?.paywall?.freeCapacity).toEqual({ byokHref: '/byok' });
  });

  it('never puts the refusal payload into the assistant content', async () => {
    mockStrandedResponse({ retryAt: RETRY_AT });

    const assistant = await sendOneTurn('anything');

    expect(assistant?.content).toBe('');
    expect(assistant?.content).not.toMatch(/free_capacity_unavailable|retry_at/);
  });
});

describe('lane transparency reaches the transcript', () => {
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

  it('stores the streamed X-AGI-Route-Lane on the assistant turn', async () => {
    mockStreamResponse({ 'X-AGI-Resolved-Model': POOL_MODEL, 'X-AGI-Route-Lane': 'free' });

    const assistant = await sendOneTurn('who served this?');

    expect(assistant?.routeLane).toBe('free');
  });

  it('leaves no lane on a turn that never consulted one', async () => {
    mockStreamResponse({ 'X-AGI-Resolved-Model': POOL_MODEL });

    const assistant = await sendOneTurn('normal turn');

    expect(assistant?.routeLane).toBeUndefined();
  });

  it('projects the stored lane into the transcript message metadata', () => {
    const stored: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'answer',
      createdAt: '2026-09-01T00:00:00.000Z',
      model: POOL_MODEL,
      routeLane: 'free',
    };

    expect(toChatMessage(stored, CONVERSATION.id).metadata?.['routeLane']).toBe('free');
  });

  it('says the free pool answered, under the model that answered', async () => {
    const user = userEvent.setup();
    render(<MessageBubble message={bubbleMessage('free')} />);

    await user.click(screen.getByLabelText('More message actions'));
    expect(screen.getByText(`${POOL_MODEL_NAME} · via free pool`)).toBeInTheDocument();
  });

  it('reads exactly as before for a managed turn and an unlabelled one', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MessageBubble message={bubbleMessage('managed')} />);
    await user.click(screen.getByLabelText('More message actions'));
    expect(screen.getByText(POOL_MODEL_NAME)).toBeInTheDocument();
    expect(screen.queryByText(/via free pool/)).toBeNull();
    await user.keyboard('{Escape}');
    unmount();

    render(<MessageBubble message={bubbleMessage()} />);
    await user.click(screen.getByLabelText('More message actions'));
    expect(screen.getByText(POOL_MODEL_NAME)).toBeInTheDocument();
    expect(screen.queryByText(/via free pool/)).toBeNull();
  });
});
