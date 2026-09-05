import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { InteractiveCard } from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { InteractiveCardBlock } from './InteractiveCardBlock';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const CARD_ID = 'toolu_01abc';

const envelope = {
  schemaVersion: 1,
  cardId: CARD_ID,
  kind: 'clarify.v1',
  createdAt: '2026-08-05T10:00:00.000Z',
  fallback: {
    headline: 'A few questions about your trip',
    text: 'What kind of day are you in the mood for?',
  },
  producedBy: { toolCallId: CARD_ID, toolName: 'ask_clarifying_questions' },
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

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function decode(raw: unknown): InteractiveCard {
  const card = parseInteractiveCardDelta({ card: raw });
  if (!card) throw new Error('fixture did not parse as an envelope');
  return card;
}

function seedTranscript(card: InteractiveCard, options: { isTemporary?: boolean } = {}): void {
  const message: Message = {
    id: MESSAGE_ID,
    role: 'assistant',
    content: 'Happy to help.',
    createdAt: '2026-08-05T10:00:00.000Z',
    metadata: { interactiveCards: [card] },
  };
  const store = useChatStore.getState();
  store.setConversations([
    {
      id: CONVERSATION_ID,
      title: 'Trip',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
      ...(options.isTemporary ? { isTemporary: true } : {}),
    },
  ]);
  store.setActiveConversationWithMessages(CONVERSATION_ID, [message]);
}

function settledResponse(state: unknown): Response {
  const settled = clone(envelope) as Record<string, unknown>;
  (settled['body'] as Record<string, unknown>)['state'] = state;
  return new Response(JSON.stringify({ ok: true, card: settled }), { status: 200 });
}

function storedCard(): InteractiveCard | undefined {
  return useChatStore.getState().messages.find((message) => message.id === MESSAGE_ID)?.metadata
    ?.interactiveCards?.[0];
}

describe('InteractiveCardBlock, response channel', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('offers the controls once the card is bound to a saved turn', () => {
    const card = decode(envelope);
    seedTranscript(card);

    render(<InteractiveCardBlock cards={[card]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send answers' })).toBeInTheDocument();
  });

  it('sends the selected answers to the response endpoint and settles the card', async () => {
    const card = decode(envelope);
    seedTranscript(card);
    vi.mocked(fetch).mockResolvedValueOnce(
      settledResponse({
        status: 'answered',
        answeredAt: '2026-08-05T10:05:00.000Z',
        answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
      }),
    );

    render(<InteractiveCardBlock cards={[card]} />);
    await act(async () => {
      screen.getByRole('button', { name: 'Relaxed' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Send answers' }).click();
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/interactive-cards/respond');
    expect(JSON.parse(String(init.body))).toEqual({
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      card_id: CARD_ID,
      response: { kind: 'answers', answers: [{ question_id: 'q1', option_ids: ['o1'] }] },
    });

    const stored = storedCard();
    expect(stored?.recognized).toBe(true);
    if (stored?.recognized && stored.kind === 'clarify.v1') {
      expect(stored.body.state.status).toBe('answered');
    }
  });

  it('sends a dismissal when the user would rather type', async () => {
    const card = decode(envelope);
    seedTranscript(card);
    vi.mocked(fetch).mockResolvedValueOnce(
      settledResponse({ status: 'dismissed', dismissedAt: '2026-08-05T10:05:00.000Z' }),
    );

    render(<InteractiveCardBlock cards={[card]} />);
    await act(async () => {
      screen.getByRole('button', { name: "I'll just type it" }).click();
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).response).toEqual({ kind: 'dismiss' });
    const stored = storedCard();
    if (stored?.recognized && stored.kind === 'clarify.v1') {
      expect(stored.body.state.status).toBe('dismissed');
    }
  });

  it('leaves the card untouched and flags the failure inline when the endpoint refuses the response', async () => {
    const card = decode(envelope);
    seedTranscript(card);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 409 }));

    render(<InteractiveCardBlock cards={[card]} />);
    await act(async () => {
      screen.getByRole('button', { name: 'Relaxed' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Send answers' }).click();
    });

    expect(fetch).toHaveBeenCalledOnce();
    const stored = storedCard();
    if (stored?.recognized && stored.kind === 'clarify.v1') {
      expect(stored.body.state.status).toBe('pending');
    }
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeEnabled();

    vi.mocked(fetch).mockResolvedValueOnce(
      settledResponse({
        status: 'answered',
        answeredAt: '2026-08-05T10:05:00.000Z',
        answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
      }),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Send answers' }).click();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders read-only when no message in the transcript carries the card', () => {
    render(<InteractiveCardBlock cards={[decode(envelope)]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send answers' })).not.toBeInTheDocument();
  });

  it('renders read-only in a temporary chat, which has no durable turn to bind to', () => {
    const card = decode(envelope);
    seedTranscript(card, { isTemporary: true });

    render(<InteractiveCardBlock cards={[card]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
  });

  it('renders read-only while the turn that produced it is still streaming', () => {
    const card = decode(envelope);
    seedTranscript(card);
    act(() => {
      useChatStore.getState().startStreaming(MESSAGE_ID, CONVERSATION_ID);
    });

    render(<InteractiveCardBlock cards={[card]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
  });

  it('renders read-only once the checkpoint deadline has passed', () => {
    const lapsed = clone(envelope) as Record<string, unknown>;
    lapsed['interaction'] = {
      runId: RUN_ID,
      awaitingResponse: true,
      expiresAt: '2020-01-01T00:00:00.000Z',
      executionMode: 'cloud_managed',
    };
    const card = decode(lapsed);
    seedTranscript(card);

    render(<InteractiveCardBlock cards={[card]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send answers' })).not.toBeInTheDocument();
  });

  it('renders read-only when any question asks for a secret this channel may not carry', () => {
    const secret = clone(envelope);
    secret.body.questions[0]!.isSecret = true;
    const card = decode(secret);
    seedTranscript(card);

    render(<InteractiveCardBlock cards={[card]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send answers' })).not.toBeInTheDocument();
  });

  it('goes read-only on its own once the checkpoint deadline passes', () => {
    vi.useFakeTimers();
    try {
      const open = clone(envelope) as Record<string, unknown>;
      open['interaction'] = {
        runId: RUN_ID,
        awaitingResponse: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        executionMode: 'cloud_managed',
      };
      const card = decode(open);
      seedTranscript(card);

      render(<InteractiveCardBlock cards={[card]} />);
      expect(screen.getByRole('button', { name: 'Relaxed' })).toBeEnabled();

      act(() => {
        vi.advanceTimersByTime(60_001);
      });

      expect(screen.getByRole('button', { name: 'Relaxed' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Send answers' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays interactive while a checkpoint is still awaiting the answer', () => {
    const open = clone(envelope) as Record<string, unknown>;
    open['interaction'] = {
      runId: RUN_ID,
      awaitingResponse: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      executionMode: 'cloud_managed',
    };
    const card = decode(open);
    seedTranscript(card);

    render(<InteractiveCardBlock cards={[card]} />);

    expect(screen.getByRole('button', { name: 'Relaxed' })).toBeEnabled();
  });
});
