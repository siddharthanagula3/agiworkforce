import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE, type InteractiveCard } from '@agiworkforce/types';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import {
  useChatStream,
  respondToInteractiveCard,
  __resetPendingTurnsForTests,
} from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
  getCsrfToken: async () => 'csrf-token',
}));

const TEMP_CONVERSATION = {
  id: 'conv-temp',
  title: 'Temporary chat',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
  isTemporary: true,
};

function mockSseStream(events: unknown[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }));
}

const CARD = {
  schemaVersion: 1,
  cardId: 'toolu_01abc',
  kind: 'clarify.v1',
  createdAt: '2026-08-05T10:00:00.000Z',
  fallback: {
    headline: 'A few questions about your trip',
    text: 'What kind of day are you in the mood for?',
  },
  producedBy: { toolCallId: 'toolu_01abc', toolName: 'ask_clarifying_questions' },
  body: {
    questions: [
      {
        id: 'q1',
        header: 'Mood',
        question: 'What kind of day are you in the mood for?',
        options: [
          { id: 'o1', label: 'Relaxed', description: 'Slow pace' },
          { id: 'o2', label: 'Packed', description: 'See everything' },
        ],
        multiSelect: false,
        isOther: true,
        isSecret: false,
      },
    ],
    state: { status: 'pending' },
  },
};

const cardEvent = (card: unknown) => ({
  choices: [{ delta: { x_interactive_card: { card } } }],
});
const textEvent = (content: string) => ({ choices: [{ delta: { content } }] });

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function assistantMessage() {
  return useChatStore.getState().messages.find((m) => m.role === 'assistant');
}

function recognizedBody(card: InteractiveCard | undefined) {
  return card?.recognized ? card.body : undefined;
}

describe('useChatStream, interactive cards', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useFreeTrialStore.getState().clearLimitReached();
    __resetPendingTurnsForTests();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function send() {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('plan me a day', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    return result;
  }

  it('carries a card from the wire onto the assistant message', async () => {
    mockSseStream([textEvent('Happy to help. '), cardEvent(CARD)]);
    await send();

    const cards = assistantMessage()?.metadata?.interactiveCards ?? [];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.recognized).toBe(true);
    expect(cards[0]?.cardId).toBe('toolu_01abc');
  });

  it('advertises only the interactive card kinds this Web client can render', async () => {
    mockSseStream([textEvent('Ready.')]);
    await send();

    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body['x_interactive_cards']).toEqual({
      supported: ['clarify.v1', 'map-search.v1', 'mcp-app.v1', 'places.v1'],
      canRespond: true,
    });
  });

  it('keeps the prose of the same turn intact', async () => {
    mockSseStream([textEvent('Happy to help. '), cardEvent(CARD), textEvent('Tap through these:')]);
    await send();

    expect(assistantMessage()?.content).toContain('Happy to help.');
    expect(assistantMessage()?.content).toContain('Tap through these:');
    expect(assistantMessage()?.metadata?.interactiveCards).toHaveLength(1);
  });

  it('keeps an unknown kind as a fallback-bearing card', async () => {
    const unknown = clone(CARD);
    unknown.kind = 'weather.v1';
    mockSseStream([cardEvent(unknown)]);
    await send();

    const cards = assistantMessage()?.metadata?.interactiveCards ?? [];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.recognized).toBe(false);
    expect(cards[0]?.fallback.text).toContain('What kind of day');
  });

  it('replaces a re-emitted card rather than duplicating it', async () => {
    const answered = clone(CARD) as Record<string, unknown>;
    (answered['body'] as Record<string, unknown>)['state'] = {
      status: 'answered',
      answeredAt: '2026-08-05T10:05:00.000Z',
      answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
    };
    mockSseStream([cardEvent(CARD), cardEvent(answered)]);
    await send();

    const cards = assistantMessage()?.metadata?.interactiveCards ?? [];
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card?.recognized).toBe(true);
    if (card?.recognized && card.kind === 'clarify.v1') {
      expect(card.body.state.status).toBe('answered');
    }
  });

  it('carries two distinct cards from one turn', async () => {
    const second = clone(CARD);
    second.cardId = 'toolu_02def';
    second.producedBy.toolCallId = 'toolu_02def';
    mockSseStream([cardEvent(CARD), cardEvent(second)]);
    await send();

    expect(assistantMessage()?.metadata?.interactiveCards).toHaveLength(2);
  });

  it('caps live cards before the assistant metadata bag is built', async () => {
    const cards = Array.from({ length: INTERACTIVE_CARDS_MAX_PER_MESSAGE + 2 }, (_, index) => {
      const card = clone(CARD);
      card.cardId = `toolu_fixture_${index}`;
      card.producedBy.toolCallId = card.cardId;
      return card;
    });
    mockSseStream(cards.map(cardEvent));
    await send();

    expect(assistantMessage()?.metadata?.interactiveCards).toHaveLength(
      INTERACTIVE_CARDS_MAX_PER_MESSAGE,
    );
  });

  it('ignores a delta that is not an envelope, without disturbing the turn', async () => {
    mockSseStream([textEvent('Here you go.'), cardEvent({ nonsense: true })]);
    await send();

    expect(assistantMessage()?.content).toContain('Here you go.');
    expect(assistantMessage()?.metadata?.interactiveCards ?? []).toHaveLength(0);
  });

  it('leaves metadata untouched for a turn with no cards', async () => {
    mockSseStream([textEvent('Just prose.')]);
    await send();

    expect(assistantMessage()?.metadata?.interactiveCards).toBeUndefined();
  });

  it('flags a card whose response the server rejected, and clears the flag on a retry that succeeds', async () => {
    mockSseStream([cardEvent(CARD)]);
    await send();
    const message = assistantMessage();
    if (!message) throw new Error('expected an assistant message');
    const binding = {
      conversationId: TEMP_CONVERSATION.id,
      messageId: message.id,
      cardId: CARD.cardId,
    };
    const answers = [{ question_id: 'q1', option_ids: ['o1'] }];

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await act(async () => {
      await respondToInteractiveCard(binding, { kind: 'answers', answers });
    });
    expect(
      assistantMessage()?.metadata?.interactiveCardSubmissionErrors?.[CARD.cardId],
    ).toBeTruthy();
    expect(recognizedBody(assistantMessage()?.metadata?.interactiveCards?.[0])).toMatchObject({
      state: { status: 'pending' },
    });

    const answered = clone(CARD) as Record<string, unknown>;
    (answered['body'] as Record<string, unknown>)['state'] = {
      status: 'answered',
      answeredAt: '2026-08-05T10:05:00.000Z',
      answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ card: answered }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await act(async () => {
      await respondToInteractiveCard(binding, { kind: 'answers', answers });
    });
    expect(
      assistantMessage()?.metadata?.interactiveCardSubmissionErrors?.[CARD.cardId],
    ).toBeUndefined();
    expect(recognizedBody(assistantMessage()?.metadata?.interactiveCards?.[0])).toMatchObject({
      state: { status: 'answered' },
    });
  });
});
