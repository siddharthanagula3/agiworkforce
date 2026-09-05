import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import type { InteractiveCard } from '@agiworkforce/types';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream, __resetPendingTurnsForTests } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION = {
  id: 'conv-temp',
  title: 'Temporary chat',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
  isTemporary: true,
};

const ASSISTANT_MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

const envelope = {
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

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function settledCard(state: unknown): InteractiveCard {
  const raw = clone(envelope) as Record<string, unknown>;
  (raw['body'] as Record<string, unknown>)['state'] = state;
  const card = parseInteractiveCardDelta({ card: raw });
  if (!card) throw new Error('fixture did not parse as an envelope');
  return card;
}

function mockSseStream() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }));
}

function seedSettledTurn(card: InteractiveCard): void {
  const message: Message = {
    id: ASSISTANT_MESSAGE_ID,
    role: 'assistant',
    content: 'Before I plan the day…',
    createdAt: '2026-08-05T10:00:00.000Z',
    metadata: { interactiveCards: [card] },
  };
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION.id, [message]);
}

async function sendAndReadMessages(): Promise<Array<{ role: string; content: unknown }>> {
  mockSseStream();
  const { result } = renderHook(() => useChatStream());
  await act(async () => {
    await result.current.sendMessage('plan me a day', { conversationId: CONVERSATION.id });
  });
  const init = vi.mocked(fetch).mock.calls[0]?.[1];
  const body = JSON.parse(String(init?.body)) as {
    messages: Array<{ role: string; content: unknown }>;
  };
  return body.messages;
}

describe('useChatStream, settled interactive card answers reach the next turn', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useFreeTrialStore.getState().clearLimitReached();
    __resetPendingTurnsForTests();
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('carries the answered options into the request the model sees', async () => {
    seedSettledTurn(
      settledCard({
        status: 'answered',
        answeredAt: '2026-08-05T10:05:00.000Z',
        answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
      }),
    );

    const messages = await sendAndReadMessages();

    const answered = messages.find((message) => String(message.content).includes('Relaxed'));
    expect(answered).toBeDefined();
    expect(answered?.role).toBe('user');
    expect(String(answered?.content)).toContain('What kind of day are you in the mood for?');
    expect(messages.indexOf(answered!)).toBe(1);
  });

  it('carries free text and reports a dismissal instead of dropping it', async () => {
    seedSettledTurn(
      settledCard({
        status: 'answered',
        answeredAt: '2026-08-05T10:05:00.000Z',
        answers: [{ questionId: 'q1', kind: 'other', text: 'museums only' }],
      }),
    );
    expect(String((await sendAndReadMessages())[1]?.content)).toContain('museums only');

    vi.mocked(fetch).mockClear();
    useChatStore.getState().reset();
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    seedSettledTurn(
      settledCard({
        status: 'dismissed',
        dismissedAt: '2026-08-05T10:05:00.000Z',
        freeText: 'just book the ferry',
      }),
    );
    expect(String((await sendAndReadMessages())[1]?.content)).toContain('just book the ferry');
  });

  it('adds nothing for a card the user has not settled yet', async () => {
    seedSettledTurn(settledCard({ status: 'pending' }));

    const messages = await sendAndReadMessages();

    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toBe('plan me a day');
  });
});
