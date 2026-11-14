import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE, type InteractiveCard } from '@agiworkforce/types';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toast } from 'sonner';
import { useChatStream, __resetPendingTurnsForTests } from './useChatStream';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  userId: 'user-1',
  sessionId: 'session-1',
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } = await import('../identity/__tests__/clerk-session-fixture');
  return createClerkSessionFixture(() => ({
    getToken: authMocks.getToken,
    userId: authMocks.userId,
    isSignedIn: true,
    isLoaded: true,
    sessionId: authMocks.sessionId,
  }));
});

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  })),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function seedResponseCard() {
  const card = parseInteractiveCardDelta({ card: clone(CARD) });
  if (!card) throw new Error('expected a valid card');
  const messageId = 'message-restored';
  useChatStore.getState().setActiveConversationWithMessages(TEMP_CONVERSATION.id, [
    {
      id: messageId,
      role: 'assistant',
      content: 'A few questions',
      createdAt: '2026-08-05T10:00:00.000Z',
      metadata: { interactiveCards: [card] },
    },
  ]);
  return { conversationId: TEMP_CONVERSATION.id, messageId, cardId: CARD.cardId };
}

function answeredCardResponse() {
  return {
    card: {
      ...clone(CARD),
      body: {
        ...clone(CARD.body),
        state: {
          status: 'answered',
          answeredAt: '2026-08-05T10:05:00.000Z',
          answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
        },
      },
    },
  };
}

describe('useChatStream, interactive cards', () => {
  beforeEach(() => {
    authMocks.userId = 'user-1';
    authMocks.sessionId = 'session-1';
    authMocks.getToken.mockReset();
    vi.mocked(addCsrfHeaders).mockReset();
    vi.mocked(addCsrfHeaders).mockImplementation(async (headers: HeadersInit = {}) => ({
      ...headers,
      'x-csrf-token': 'csrf-token',
    }));
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
      supported: [
        'answer-ui.v1',
        'clarify.v1',
        'image.v1',
        'itinerary.v1',
        'map-search.v1',
        'mcp-app.v1',
        'places.v1',
        'product-comparison.v1',
      ],
      canRespond: true,
    });
  });

  it('carries an answer UI card onto the assistant message so it replays from metadata', async () => {
    const answerUi = {
      schemaVersion: 1,
      cardId: 'answer-ui-toolu_9',
      kind: 'answer-ui.v1',
      createdAt: '2026-10-25T10:00:00.000Z',
      fallback: { headline: 'Checklist', text: '- [ ] Check links' },
      producedBy: { toolCallId: 'toolu_9', toolName: 'render_answer_ui' },
      body: {
        blocks: [
          {
            type: 'checklist',
            id: 'qa',
            items: [{ id: 'links', label: 'Check links', checked: false }],
          },
        ],
      },
    };
    mockSseStream([textEvent('Here is a checklist.'), cardEvent(answerUi)]);
    await send();

    const [card] = assistantMessage()?.metadata?.interactiveCards ?? [];
    expect(card?.recognized).toBe(true);
    expect(card?.kind).toBe('answer-ui.v1');
    expect(card?.fallback.text).toBe('- [ ] Check links');
  });

  it('keeps the prose of the same turn intact', async () => {
    mockSseStream([textEvent('Happy to help. '), cardEvent(CARD), textEvent('Tap through these:')]);
    await send();

    expect(assistantMessage()?.content).toContain('Happy to help.');
    expect(assistantMessage()?.content).toContain('Tap through these:');
    expect(assistantMessage()?.metadata?.interactiveCards).toHaveLength(1);
  });

  it('records where in the prose each card arrived, so it renders in stream order', async () => {
    const leading = clone(CARD);
    leading.cardId = 'toolu_lead';
    mockSseStream([
      cardEvent(leading),
      textEvent('Here is the image you asked for. '),
      cardEvent(CARD),
    ]);
    await send();

    expect(assistantMessage()?.metadata?.interactiveCardTextOffsets).toEqual({
      toolu_lead: 0,
      toolu_01abc: 'Here is the image you asked for. '.length,
    });
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
    const runtime = await send();
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
      await runtime.current.respondToInteractiveCard(binding, { kind: 'answers', answers });
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
      await runtime.current.respondToInteractiveCard(binding, { kind: 'answers', answers });
    });
    expect(
      assistantMessage()?.metadata?.interactiveCardSubmissionErrors?.[CARD.cardId],
    ).toBeUndefined();
    expect(recognizedBody(assistantMessage()?.metadata?.interactiveCards?.[0])).toMatchObject({
      state: { status: 'answered' },
    });
  });

  it('deduplicates pending responses and sends the captured bearer without cookies', async () => {
    const binding = seedResponseCard();
    const response = deferred<Response>();
    const dispatched = deferred<void>();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      dispatched.resolve();
      return response.promise;
    });
    const { result } = renderHook(() => useChatStream({ followActiveConversation: false }));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    await dispatched.promise;
    expect(result.current.isInteractiveCardResponsePending(binding)).toBe(true);
    await act(async () => {
      await result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/interactive-cards/respond');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer session-token');
    expect(init?.credentials).toBe('omit');
    await act(async () => {
      response.resolve(new Response(JSON.stringify(answeredCardResponse()), { status: 200 }));
      await pending;
    });
    expect(result.current.isInteractiveCardResponsePending(binding)).toBe(false);
    expect(recognizedBody(assistantMessage()?.metadata?.interactiveCards?.[0])).toMatchObject({
      state: { status: 'answered' },
    });
  });

  it('drops CSRF-delayed responses after an account switch and retains retired turn evidence', async () => {
    const binding = seedResponseCard();
    const headers = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockImplementationOnce(() => headers.promise);
    const notify = vi.spyOn(toast, 'error');
    const { result, rerender } = renderHook(() =>
      useChatStream({ followActiveConversation: false }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    authMocks.userId = 'user-2';
    authMocks.sessionId = 'session-2';
    rerender();
    await act(async () => {
      headers.resolve({ 'Content-Type': 'application/json' });
      await pending;
      await result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    expect(authMocks.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(assistantMessage()?.metadata?.interactiveCardSubmissionErrors).toBeUndefined();
    expect(result.current.isInteractiveCardResponsePending(binding)).toBe(false);
  });

  it('drops token-delayed responses after same-account session replacement', async () => {
    const binding = seedResponseCard();
    const token = deferred<string>();
    const started = deferred<void>();
    authMocks.getToken.mockImplementationOnce(() => {
      started.resolve();
      return token.promise;
    });
    const { result, rerender } = renderHook(() =>
      useChatStream({ followActiveConversation: false }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    await started.promise;
    authMocks.sessionId = 'session-replacement';
    rerender();
    await act(async () => {
      token.resolve('session-token');
      await pending;
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(assistantMessage()?.metadata?.interactiveCardSubmissionErrors).toBeUndefined();
  });

  it.each(['account-switch', 'unmount'] as const)(
    'ignores a response decoded after %s',
    async (interruption) => {
      const binding = seedResponseCard();
      const decoded = deferred<unknown>();
      const started = deferred<void>();
      const response = new Response(null, { status: 200 });
      vi.spyOn(response, 'json').mockImplementation(() => {
        started.resolve();
        return decoded.promise;
      });
      vi.mocked(fetch).mockResolvedValueOnce(response);
      const notify = vi.spyOn(toast, 'error');
      const { result, rerender, unmount } = renderHook(() =>
        useChatStream({ followActiveConversation: false }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
      });
      await started.promise;
      if (interruption === 'unmount') {
        unmount();
      } else {
        authMocks.userId = 'user-2';
        authMocks.sessionId = 'session-2';
        rerender();
      }
      await act(async () => {
        decoded.resolve(answeredCardResponse());
        await pending;
      });
      expect(recognizedBody(assistantMessage()?.metadata?.interactiveCards?.[0])).toMatchObject({
        state: { status: 'pending' },
      });
      expect(assistantMessage()?.metadata?.interactiveCardSubmissionErrors).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it('does not let an unmounted request failure clear a replacement runtime pending claim', async () => {
    const binding = seedResponseCard();
    const oldResponse = deferred<Response>();
    const newResponse = deferred<Response>();
    const oldDispatched = deferred<void>();
    const newDispatched = deferred<void>();
    vi.mocked(fetch)
      .mockImplementationOnce(async () => {
        oldDispatched.resolve();
        return oldResponse.promise;
      })
      .mockImplementationOnce(async () => {
        newDispatched.resolve();
        return newResponse.promise;
      });
    const notify = vi.spyOn(toast, 'error');
    const oldRuntime = renderHook(() => useChatStream({ followActiveConversation: false }));
    let oldPending!: Promise<void>;
    act(() => {
      oldPending = oldRuntime.result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    await oldDispatched.promise;
    oldRuntime.unmount();
    const newRuntime = renderHook(() => useChatStream({ followActiveConversation: false }));
    let newPending!: Promise<void>;
    act(() => {
      newPending = newRuntime.result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    await newDispatched.promise;
    await act(async () => {
      oldResponse.reject(new Error('late request failure'));
      await oldPending;
    });
    expect(newRuntime.result.current.isInteractiveCardResponsePending(binding)).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(assistantMessage()?.metadata?.interactiveCardSubmissionErrors).toBeUndefined();
    await act(async () => {
      newResponse.resolve(new Response(JSON.stringify(answeredCardResponse()), { status: 200 }));
      await newPending;
    });
    expect(newRuntime.result.current.isInteractiveCardResponsePending(binding)).toBe(false);
  });

  it('refuses a settled response for a different card', async () => {
    const binding = seedResponseCard();
    const response = answeredCardResponse();
    response.card.cardId = 'different-card';
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const { result } = renderHook(() => useChatStream({ followActiveConversation: false }));
    await act(async () => {
      await result.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    expect(recognizedBody(assistantMessage()?.metadata?.interactiveCards?.[0])).toMatchObject({
      state: { status: 'pending' },
    });
    expect(
      assistantMessage()?.metadata?.interactiveCardSubmissionErrors?.[binding.cardId],
    ).toBeTruthy();
  });

  it('refuses an action retained from an unmounted runtime', async () => {
    const binding = seedResponseCard();
    const { result, unmount } = renderHook(() =>
      useChatStream({ followActiveConversation: false }),
    );
    const respond = result.current.respondToInteractiveCard;
    unmount();
    await respond(binding, { kind: 'dismiss' });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(authMocks.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(assistantMessage()?.metadata?.interactiveCardSubmissionErrors).toBeUndefined();
  });

  it('does not revive a recorded turn retired by a newer same-session send', async () => {
    mockSseStream([cardEvent(CARD)]);
    const runtime = await send();
    const messageId = assistantMessage()?.id;
    if (!messageId) throw new Error('expected an assistant message');
    const binding = { conversationId: TEMP_CONVERSATION.id, messageId, cardId: CARD.cardId };
    mockSseStream([textEvent('A newer answer')]);
    await act(async () => {
      await runtime.current.sendMessage('A newer question', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    vi.mocked(fetch).mockClear();
    await act(async () => {
      await runtime.current.respondToInteractiveCard(binding, { kind: 'dismiss' });
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('continuing an answered card', () => {
    const ANSWERED_CONVERSATION = '0190a000-0000-7000-8000-0000000000a1';
    const OTHER_CONVERSATION = '0190a000-0000-7000-8000-0000000000a2';
    const ANSWERED_MESSAGE = '0190a000-0000-7000-8000-0000000000a3';

    function seedAnsweredCard() {
      const card = parseInteractiveCardDelta({ card: answeredCardResponse().card });
      if (!card) throw new Error('expected a valid card');
      const savedConversation = (id: string) => ({
        id,
        title: 'Saved chat',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      });
      useChatStore.setState({
        conversations: [
          savedConversation(ANSWERED_CONVERSATION),
          savedConversation(OTHER_CONVERSATION),
        ],
      });
      useChatStore.getState().setActiveConversationWithMessages(OTHER_CONVERSATION, [
        {
          id: '0190a000-0000-7000-8000-0000000000a4',
          role: 'user',
          content: 'An unrelated chat',
          createdAt: '2026-08-05T09:00:00.000Z',
        },
      ]);
      useChatStore.getState().setActiveConversationWithMessages(ANSWERED_CONVERSATION, [
        {
          id: '0190a000-0000-7000-8000-0000000000a5',
          role: 'user',
          content: 'plan me a day',
          createdAt: '2026-08-05T09:59:00.000Z',
        },
        {
          id: ANSWERED_MESSAGE,
          role: 'assistant',
          content: 'A few questions',
          createdAt: '2026-08-05T10:00:00.000Z',
          metadata: { interactiveCards: [card] },
        },
      ]);
    }

    function chatRequestBodies(): Array<Record<string, unknown>> {
      return vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes('/chat/completions'))
        .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    }

    it('continues the conversation the card was answered in after the user switches away', async () => {
      seedAnsweredCard();
      const saved = deferred<Response>();
      vi.mocked(fetch).mockImplementationOnce(() => saved.promise);
      mockSseStream([textEvent('Here is your day')]);
      const { result } = renderHook(() => useChatStream({ followActiveConversation: false }));

      let resumed!: Promise<void>;
      act(() => {
        resumed = result.current.resumeInteractiveCardTurn(ANSWERED_MESSAGE);
      });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      act(() => {
        useChatStore.getState().setActiveConversation(OTHER_CONVERSATION);
      });
      saved.resolve(
        new Response(JSON.stringify({ message: { id: ANSWERED_MESSAGE } }), { status: 200 }),
      );
      await act(async () => {
        await resumed;
      });

      const bodies = chatRequestBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        conversation_id: ANSWERED_CONVERSATION,
        assistant_message_id: ANSWERED_MESSAGE,
      });
    });

    it('continues a named conversation even when another one is displayed', async () => {
      seedAnsweredCard();
      useChatStore.getState().setActiveConversation(OTHER_CONVERSATION);
      mockSseStream([textEvent('Here is your day')]);
      const { result } = renderHook(() => useChatStream({ followActiveConversation: false }));

      await act(async () => {
        await result.current.continueGeneration(ANSWERED_MESSAGE, {
          conversationId: ANSWERED_CONVERSATION,
        });
      });

      expect(chatRequestBodies()).toHaveLength(1);
      expect(chatRequestBodies()[0]).toMatchObject({ conversation_id: ANSWERED_CONVERSATION });
    });
  });

  it('keeps the original binding and payload while CSRF is pending', async () => {
    const binding = seedResponseCard();
    const headers = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockImplementationOnce(() => headers.promise);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(answeredCardResponse()), { status: 200 }),
    );
    const { result } = renderHook(() => useChatStream({ followActiveConversation: false }));
    const payload = { kind: 'dismiss' as const, text: 'Original reply' };
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.respondToInteractiveCard(binding, payload);
    });
    binding.cardId = 'different-card';
    payload.text = 'Changed reply';
    await act(async () => {
      headers.resolve({ 'Content-Type': 'application/json' });
      await pending;
    });
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      card_id: CARD.cardId,
      response: { kind: 'dismiss', text: 'Original reply' },
    });
  });
});
