import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ClarifyCardBody, InteractiveCard } from '@agiworkforce/types';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const CARD_ID = 'toolu_01abc';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({
  normalizeMessageMetadata: (value: unknown) => value,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query, execute: mocks.execute },
    userId: 'user-1',
    organizationId: ORGANIZATION_ID,
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { POST } = await import('./route');
const { getUserScopedDb } = await import('@/lib/server/rls-db');

const cardEnvelope = {
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

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function respondRequest(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/interactive-cards/respond', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function answersFor(answers: unknown[]) {
  return {
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    card_id: CARD_ID,
    response: { kind: 'answers', answers },
  };
}

function seedRows(card: unknown = cardEnvelope) {
  mocks.query.mockResolvedValueOnce([{ id: CONVERSATION_ID }]);
  mocks.query.mockResolvedValueOnce([{ metadata: { interactiveCards: [card] } }]);
}

function persistedCards(): InteractiveCard[] {
  const [, params] = mocks.execute.mock.calls[0] as [string, [string, string, string]];
  const metadata = JSON.parse(params[0]) as { interactiveCards: InteractiveCard[] };
  return metadata.interactiveCards;
}

function persistedClarifyState(): ClarifyCardBody['state'] {
  const [card] = persistedCards();
  if (!card?.recognized || card.kind !== 'clarify.v1') {
    throw new Error('persisted card is not a recognized clarify card');
  }
  return card.body.state;
}

describe('POST /api/interactive-cards/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.query.mockResolvedValue([]);
    mocks.execute.mockResolvedValue(1);
  });

  it('records answers against the card that asked them', async () => {
    seedRows();

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringMatching(/update web_messages[\s\S]*metadata is not distinct from \$4::jsonb/),
      [
        expect.any(String),
        MESSAGE_ID,
        CONVERSATION_ID,
        JSON.stringify({ interactiveCards: [cardEnvelope] }),
      ],
    );
    expect(persistedClarifyState()).toEqual({
      status: 'answered',
      answeredAt: expect.any(String),
      answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
    });
    const body = (await response.json()) as { card: InteractiveCard };
    expect(body.card.cardId).toBe(CARD_ID);
  });

  it('keeps free text as an other answer and silence as skipped', async () => {
    seedRows();
    await POST(respondRequest(answersFor([{ question_id: 'q1', text: '  museums only  ' }])));
    expect(persistedClarifyState()).toMatchObject({
      answers: [{ questionId: 'q1', kind: 'other', text: 'museums only' }],
    });

    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
    seedRows();
    await POST(respondRequest(answersFor([{ question_id: 'q1', skipped: true }])));
    expect(persistedClarifyState()).toMatchObject({
      answers: [{ questionId: 'q1', kind: 'skipped' }],
    });
  });

  it('settles a dismissal with the words the user typed instead', async () => {
    seedRows();

    const response = await POST(
      respondRequest({
        conversation_id: CONVERSATION_ID,
        message_id: MESSAGE_ID,
        card_id: CARD_ID,
        response: { kind: 'dismiss', text: 'just book the ferry' },
      }),
    );

    expect(response.status).toBe(200);
    expect(persistedClarifyState()).toEqual({
      status: 'dismissed',
      dismissedAt: expect.any(String),
      freeText: 'just book the ferry',
    });
  });

  it('rejects a conversation outside the active organization before reading the message', async () => {
    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/user_id = \$2[\s\S]*organization_id is not distinct from \$3/),
      [CONVERSATION_ID, 'user-1', ORGANIZATION_ID],
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a card id that is not on the named message', async () => {
    const other = clone(cardEnvelope);
    other.cardId = 'toolu_02def';
    other.producedBy.toolCallId = 'toolu_02def';
    seedRows(other);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a response to a card that is no longer pending', async () => {
    const answered = clone(cardEnvelope) as Record<string, unknown>;
    (answered['body'] as Record<string, unknown>)['state'] = {
      status: 'answered',
      answeredAt: '2026-08-05T10:05:00.000Z',
      answers: [{ questionId: 'q1', kind: 'options', optionIds: ['o1'], labels: ['Relaxed'] }],
    };
    seedRows(answered);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o2'] }])),
    );

    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a response to a checkpoint whose deadline has passed', async () => {
    const expired = clone(cardEnvelope) as Record<string, unknown>;
    expired['interaction'] = {
      runId: RUN_ID,
      awaitingResponse: true,
      expiresAt: '2020-01-01T00:00:00.000Z',
      executionMode: 'cloud_managed',
    };
    seedRows(expired);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('accepts a response while the checkpoint is still open', async () => {
    const open = clone(cardEnvelope) as Record<string, unknown>;
    open['interaction'] = {
      runId: RUN_ID,
      awaitingResponse: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      executionMode: 'cloud_managed',
    };
    seedRows(open);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(200);
  });

  it('rejects an option the card never offered', async () => {
    seedRows();

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o9'] }])),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects an answer to a question the card never asked', async () => {
    seedRows();

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q7', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects two answers to the same question', async () => {
    seedRows();

    const response = await POST(
      respondRequest(
        answersFor([
          { question_id: 'q1', option_ids: ['o1'] },
          { question_id: 'q1', option_ids: ['o2'] },
        ]),
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects several options for a single-select question', async () => {
    seedRows();

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1', 'o2'] }])),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('refuses a card carrying a secret question, the same card the client renders read-only', async () => {
    const secret = clone(cardEnvelope);
    secret.body.questions[0]!.isSecret = true;
    seedRows(secret);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', text: 'hunter2' }])),
    );

    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('refuses a dismissal longer than the card contract allows', async () => {
    seedRows();

    const response = await POST(
      respondRequest({
        conversation_id: CONVERSATION_ID,
        message_id: MESSAGE_ID,
        card_id: CARD_ID,
        response: { kind: 'dismiss', text: 'x'.repeat(2_001) },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('refuses to clobber a message whose metadata changed while the answer was in flight', async () => {
    seedRows();
    mocks.execute.mockResolvedValueOnce(0);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(409);
  });

  it('rejects a malformed request before touching the database', async () => {
    const response = await POST(
      respondRequest({
        conversation_id: 'not-a-uuid',
        message_id: MESSAGE_ID,
        card_id: CARD_ID,
        response: { kind: 'answers', answers: [{ question_id: 'q1' }] },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns the csrf failure without reading any card', async () => {
    const forbidden = new Response(null, { status: 403 });
    mocks.requireCsrfToken.mockResolvedValueOnce(forbidden as never);

    const response = await POST(
      respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])),
    );

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('reads and settles the card through the rls scoped handle', async () => {
    seedRows();

    await POST(respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])));

    expect(getUserScopedDb).toHaveBeenCalledTimes(1);
  });

  it('leaves every other card on the message untouched', async () => {
    const second = clone(cardEnvelope);
    second.cardId = 'toolu_02def';
    second.producedBy.toolCallId = 'toolu_02def';
    mocks.query.mockResolvedValueOnce([{ id: CONVERSATION_ID }]);
    mocks.query.mockResolvedValueOnce([{ metadata: { interactiveCards: [cardEnvelope, second] } }]);

    await POST(respondRequest(answersFor([{ question_id: 'q1', option_ids: ['o1'] }])));

    const cards = persistedCards();
    expect(cards).toHaveLength(2);
    const untouched = cards[1];
    if (!untouched?.recognized || untouched.kind !== 'clarify.v1') {
      throw new Error('second card did not survive the update');
    }
    expect(untouched.body.state.status).toBe('pending');
  });
});
