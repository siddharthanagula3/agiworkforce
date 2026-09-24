import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const FIRST_TURN_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_TURN_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-provenance';

type StoredRow = { content: string; model: string; metadata: Record<string, unknown> };

const rows = new Map<string, StoredRow>();

/** The column merges with `||`, so a replay is only honest if the fake does too. */
const db = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('select active_leaf_message_id')) return [{ active_leaf_message_id: null }];
    if (sql.includes('select m.content, m.model, m.metadata')) {
      const row = rows.get(String(params[0]));
      return row ? [row] : [];
    }
    return [];
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (!sql.includes('insert into web_messages')) return 0;
    const id = String(params[0]);
    const incoming = JSON.parse(String(params[7])) as Record<string, unknown>;
    const previous = rows.get(id);
    rows.set(id, {
      content: String(params[2]),
      model: String(params[3]),
      metadata: { ...(previous?.metadata ?? {}), ...incoming },
    });
    return 1;
  }),
  transaction: vi.fn(),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getNeonDb: () => db,
}));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createClaimedUserScopedDb: () => db,
}));
vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    scheduleArtifactIndexing: vi.fn(),
  }),
);

import { persistAssistantTurn, type AssistantTurnSnapshot } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

function request(overrides: Record<string, unknown> = {}): ProcessedRequest {
  return {
    requestId: 'req-provenance',
    conversationId: CONVERSATION_ID,
    assistantMessageId: FIRST_TURN_ID,
    conversationIsTemporary: false,
    organizationId: null,
    requestedModel: 'fixture-first-model',
    routeLane: 'fixture-lane',
    resolvedSlot: 'fixture-slot',
    resolvedTaskType: 'fixture-task',
    routePlanId: 'plan-1',
    servingHarnessId: 'fixture-harness',
    usedFallback: false,
    fallbackReason: null,
    retries: 0,
    toolExecutionObserved: false,
    chatRequest: { model: 'fixture-first-model' },
    llmRequest: { model: 'fixture-first-model', messages: [], max_tokens: 1024 },
    ...overrides,
  } as unknown as ProcessedRequest;
}

function snapshot(overrides: Partial<AssistantTurnSnapshot> = {}): AssistantTurnSnapshot {
  return {
    content: 'An answer.',
    model: 'fixture-first-model',
    provider: 'fixture-provider',
    inputTokens: 10,
    outputTokens: 20,
    truncated: false,
    ...overrides,
  };
}

function stored(id: string): StoredRow {
  const row = rows.get(id);
  expect(row, `turn ${id} should have been written`).toBeDefined();
  return row as StoredRow;
}

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
});

/**
 * Changing model mid-conversation is a choice about the next turn. The turns
 * already on screen were answered by something else, and a reader deciding
 * whether to trust an answer is reading the model beside it.
 */
describe('a conversation whose model changes between turns', () => {
  it('answers the next turn with the new selection and leaves the earlier one alone', async () => {
    await persistAssistantTurn({ processed: request(), userId: USER_ID, snapshot: snapshot() });
    await persistAssistantTurn({
      processed: request({
        assistantMessageId: SECOND_TURN_ID,
        requestedModel: 'fixture-second-model',
        chatRequest: { model: 'fixture-second-model' },
      }),
      userId: USER_ID,
      snapshot: snapshot({ model: 'fixture-second-model' }),
    });

    expect(stored(FIRST_TURN_ID).model).toBe('fixture-first-model');
    expect(stored(FIRST_TURN_ID).metadata['servedModel']).toBe('fixture-first-model');
    expect(stored(FIRST_TURN_ID).metadata['requestedModel']).toBe('fixture-first-model');
    expect(stored(SECOND_TURN_ID).model).toBe('fixture-second-model');
    expect(stored(SECOND_TURN_ID).metadata['servedModel']).toBe('fixture-second-model');
    expect(stored(SECOND_TURN_ID).metadata['requestedModel']).toBe('fixture-second-model');
  });

  it('keeps each turn on the provider that actually answered it', async () => {
    await persistAssistantTurn({ processed: request(), userId: USER_ID, snapshot: snapshot() });
    await persistAssistantTurn({
      processed: request({ assistantMessageId: SECOND_TURN_ID }),
      userId: USER_ID,
      snapshot: snapshot({ model: 'fixture-second-model', provider: 'fixture-other-provider' }),
    });

    expect(stored(FIRST_TURN_ID).metadata['provider']).toBe('fixture-provider');
    expect(stored(SECOND_TURN_ID).metadata['provider']).toBe('fixture-other-provider');
  });
});

/**
 * The server row is the floor under a client save that never landed. A move the
 * floor does not carry is a move nobody is ever told about, because the reader
 * renders it from these two keys.
 */
describe('a turn the router moved off the model that was asked for', () => {
  it('records the model it moved from and why, where the reader looks', async () => {
    await persistAssistantTurn({
      processed: request({
        usedFallback: true,
        fallbackReason: 'upstream_timeout',
        movedFromModel: 'fixture-pinned-model',
        movedReason: 'The pinned model did not answer in time.',
      }),
      userId: USER_ID,
      snapshot: snapshot({ model: 'fixture-served-model' }),
    });

    const metadata = stored(FIRST_TURN_ID).metadata;
    expect(metadata['movedFromModel']).toBe('fixture-pinned-model');
    expect(metadata['movedReason']).toBe('The pinned model did not answer in time.');
    expect(metadata['servedModel']).toBe('fixture-served-model');
  });

  it('claims no move on a turn that stayed on the model that was asked for', async () => {
    await persistAssistantTurn({ processed: request(), userId: USER_ID, snapshot: snapshot() });

    const metadata = stored(FIRST_TURN_ID).metadata;
    expect(metadata['movedFromModel']).toBeNull();
    expect(metadata['movedReason']).toBeNull();
  });

  /** Stop then Continue reuses the message id, so the row is written twice. */
  it('drops the first attempt disclosure when the retry stayed where it was asked', async () => {
    await persistAssistantTurn({
      processed: request({
        usedFallback: true,
        fallbackReason: 'upstream_timeout',
        movedFromModel: 'fixture-pinned-model',
        movedReason: 'The pinned model did not answer in time.',
      }),
      userId: USER_ID,
      snapshot: snapshot({ model: 'fixture-served-model', truncated: true }),
    });
    await persistAssistantTurn({
      processed: request(),
      userId: USER_ID,
      snapshot: snapshot({ model: 'fixture-first-model' }),
    });

    const metadata = stored(FIRST_TURN_ID).metadata;
    expect(metadata['movedFromModel']).toBeNull();
    expect(metadata['movedReason']).toBeNull();
    expect(metadata['servedModel']).toBe('fixture-first-model');
  });
});
