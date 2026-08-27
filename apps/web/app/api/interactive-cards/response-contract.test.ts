import { describe, expect, it } from 'vitest';
import { CLARIFY_OTHER_MAX_LENGTH, type InteractiveCard } from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  InteractiveCardResponsePayloadSchema,
  InteractiveCardResponseRequestSchema,
  interactiveCardAcceptsResponse,
} from './response-contract';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

const envelope = {
  schemaVersion: 1,
  cardId: 'toolu_01abc',
  kind: 'clarify.v1',
  createdAt: '2026-08-05T10:00:00.000Z',
  fallback: { headline: 'A few questions', text: 'What kind of day?' },
  producedBy: { toolCallId: 'toolu_01abc', toolName: 'ask_clarifying_questions' },
  body: {
    questions: [
      {
        id: 'q1',
        header: 'Mood',
        question: 'What kind of day?',
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

function decode(mutate: (raw: Record<string, unknown>) => void = () => undefined): InteractiveCard {
  const raw = clone(envelope) as Record<string, unknown>;
  mutate(raw);
  const card = parseInteractiveCardDelta({ card: raw });
  if (!card) throw new Error('fixture did not parse as an envelope');
  return card;
}

describe('interactiveCardAcceptsResponse', () => {
  it('accepts a pending clarify card with no checkpoint of its own', () => {
    expect(interactiveCardAcceptsResponse(decode())).toBe(true);
  });

  it('accepts a checkpoint that is still awaiting the answer', () => {
    const card = decode((raw) => {
      raw['interaction'] = {
        runId: RUN_ID,
        awaitingResponse: true,
        expiresAt: '2026-08-05T11:00:00.000Z',
        executionMode: 'cloud_managed',
      };
    });
    expect(interactiveCardAcceptsResponse(card, Date.parse('2026-08-05T10:30:00.000Z'))).toBe(true);
    expect(interactiveCardAcceptsResponse(card, Date.parse('2026-08-05T11:30:00.000Z'))).toBe(
      false,
    );
  });

  it('refuses a checkpoint that has stopped waiting', () => {
    const card = decode((raw) => {
      raw['interaction'] = {
        runId: RUN_ID,
        awaitingResponse: false,
        expiresAt: '2026-08-05T11:00:00.000Z',
        executionMode: 'cloud_managed',
      };
    });
    expect(interactiveCardAcceptsResponse(card, Date.parse('2026-08-05T10:30:00.000Z'))).toBe(
      false,
    );
  });

  it.each(['answered', 'dismissed', 'expired'] as const)('refuses a %s card', (status) => {
    const card = decode((raw) => {
      const body = raw['body'] as Record<string, unknown>;
      body['state'] =
        status === 'answered'
          ? { status, answeredAt: '2026-08-05T10:05:00.000Z', answers: [] }
          : status === 'dismissed'
            ? { status, dismissedAt: '2026-08-05T10:05:00.000Z' }
            : { status, reason: 'checkpoint_gone' };
    });
    expect(interactiveCardAcceptsResponse(card)).toBe(false);
  });

  it('refuses a card that asks for a secret, which this channel may never persist', () => {
    const card = decode((raw) => {
      const body = raw['body'] as Record<string, unknown>;
      (body['questions'] as Array<Record<string, unknown>>)[0]!['isSecret'] = true;
    });
    expect(interactiveCardAcceptsResponse(card)).toBe(false);
  });

  it('refuses a card this build could not validate', () => {
    const card = decode((raw) => {
      raw['kind'] = 'weather.v1';
    });
    expect(card.recognized).toBe(false);
    expect(interactiveCardAcceptsResponse(card)).toBe(false);
  });

  it('refuses a recognized kind that has no answer to give', () => {
    const card = decode((raw) => {
      raw['kind'] = 'mcp-app.v1';
      raw['body'] = {
        payloadId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        connectorId: 'linear',
        toolName: 'create_issue',
        resourceUri: 'ui://linear/create-issue',
      };
    });
    expect(card.recognized).toBe(true);
    expect(interactiveCardAcceptsResponse(card)).toBe(false);
  });
});

describe('InteractiveCardResponseRequestSchema', () => {
  const request = (response: unknown) => ({
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    card_id: 'toolu_01abc',
    response,
  });

  it('accepts the two payload shapes the contract defines', () => {
    expect(
      InteractiveCardResponseRequestSchema.safeParse(
        request({ kind: 'answers', answers: [{ question_id: 'q1', option_ids: ['o1'] }] }),
      ).success,
    ).toBe(true);
    expect(
      InteractiveCardResponseRequestSchema.safeParse(request({ kind: 'dismiss' })).success,
    ).toBe(true);
  });

  it('rejects a card response that is not bound to a conversation and message', () => {
    expect(
      InteractiveCardResponseRequestSchema.safeParse({
        card_id: 'toolu_01abc',
        response: { kind: 'dismiss' },
      }).success,
    ).toBe(false);
    expect(
      InteractiveCardResponseRequestSchema.safeParse({
        ...request({ kind: 'dismiss' }),
        conversation_id: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('rejects smuggled fields and oversized free text', () => {
    expect(
      InteractiveCardResponsePayloadSchema.safeParse({
        kind: 'answers',
        answers: [{ question_id: 'q1', run_id: RUN_ID }],
      }).success,
    ).toBe(false);
    expect(
      InteractiveCardResponsePayloadSchema.safeParse({
        kind: 'answers',
        answers: [{ question_id: 'q1', text: 'x'.repeat(CLARIFY_OTHER_MAX_LENGTH + 1) }],
      }).success,
    ).toBe(false);
  });

  it('rejects an empty answer set and an unknown payload kind', () => {
    expect(
      InteractiveCardResponsePayloadSchema.safeParse({ kind: 'answers', answers: [] }).success,
    ).toBe(false);
    expect(InteractiveCardResponsePayloadSchema.safeParse({ kind: 'approve' }).success).toBe(false);
  });
});
