import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_TURN_ATTRIBUTION_KEYS } from '@agiworkforce/types';

const CONVERSATION_ID = '77777777-7777-4777-8777-777777777777';
const MESSAGE_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = 'user-owner';

type StoredRow = { content: string; model: string; metadata: Record<string, unknown> };

const rows = new Map<string, StoredRow>();

/**
 * The insert's on-conflict set-list merges with `||`, so a replay onto the same
 * message id is only honest if the fake merges the same way the column does.
 */
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
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => db }));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

import {
  persistAssistantTurn,
  readPersistedAssistantTurn,
  type AssistantTurnSnapshot,
} from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const processed = {
  requestId: 'req-attribution',
  conversationId: CONVERSATION_ID,
  assistantMessageId: MESSAGE_ID,
  conversationIsTemporary: false,
  organizationId: null,
  requestedModel: 'fixture-requested-model',
  routeLane: 'fixture-lane',
  resolvedSlot: 'fixture-slot',
  resolvedTaskType: 'fixture-task',
  routePlanId: 'plan-1',
  servingHarnessId: 'fixture-harness',
  usedFallback: true,
  fallbackReason: 'upstream_timeout',
  movedFromModel: 'fixture-pinned-model',
  retries: 2,
  toolExecutionObserved: true,
  chatRequest: { model: 'fixture-served-model' },
  llmRequest: {
    model: 'fixture-served-model',
    messages: [],
    max_tokens: 1024,
    thinking_mode: true,
    effort: 'high',
    thinking: { type: 'enabled', budget_tokens: 4096 },
    tools: [{ function: { name: 'web_search' } }, { name: 'run_code' }],
  },
} as unknown as ProcessedRequest;

function snapshot(overrides: Partial<AssistantTurnSnapshot> = {}): AssistantTurnSnapshot {
  return {
    content: 'The answer, whole.',
    model: 'fixture-served-model',
    provider: 'fixture-provider',
    inputTokens: 12,
    outputTokens: 34,
    truncated: false,
    ...overrides,
  };
}

function storedMetadata(): Record<string, unknown> {
  const row = rows.get(MESSAGE_ID);
  expect(row, 'the turn should have been written').toBeDefined();
  return row?.metadata ?? {};
}

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
});

describe('route-lane reload provenance', () => {
  it('writes the served lane where the transcript reload path reads it', async () => {
    await persistAssistantTurn({
      processed: { ...processed, routeLane: 'free' },
      userId: USER_ID,
      snapshot: snapshot(),
    });

    expect(storedMetadata()['routeLane']).toBe('free');
    expect((storedMetadata()['requestedRoute'] as { lane?: unknown }).lane).toBe('free');
  });
});

/**
 * Stop then Continue reuses the same assistant_message_id, so the completing
 * write lands on the cancelled attempt's row rather than on a fresh one.
 */
describe('a turn that was cancelled and then completed', () => {
  it('is no longer reported as truncated', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ content: 'The answer, cut', truncated: true }),
    });
    expect(storedMetadata()['truncated']).toBe(true);

    await persistAssistantTurn({ processed, userId: USER_ID, snapshot: snapshot() });

    const metadata = storedMetadata();
    expect(metadata['truncated']).toBe(false);
    expect(metadata['truncationReason']).toBeNull();
    expect(metadata['completionStatus']).toBe('complete');
  });

  it('reads back whole, so a resume does not replay it as interrupted', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ content: 'The answer, cut', truncated: true }),
    });
    await persistAssistantTurn({ processed, userId: USER_ID, snapshot: snapshot() });

    await expect(
      readPersistedAssistantTurn({
        userId: USER_ID,
        organizationId: null,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      }),
    ).resolves.toMatchObject({
      content: 'The answer, whole.',
      truncated: false,
      truncationReason: null,
    });
  });

  it('still reports a turn that was cancelled and never resumed', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({ content: 'The answer, cut', truncated: true }),
    });

    const metadata = storedMetadata();
    expect(metadata['completionStatus']).toBe('truncated');
    expect(metadata['truncationReason']).toBe('stream_cancelled');
    await expect(
      readPersistedAssistantTurn({
        userId: USER_ID,
        organizationId: null,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
      }),
    ).resolves.toMatchObject({ truncated: true, truncationReason: 'stream_cancelled' });
  });
});

describe('every attribution the conversation contract declares', () => {
  it('is written on a turn, so no reader has to tell absent from did not happen', async () => {
    await persistAssistantTurn({ processed, userId: USER_ID, snapshot: snapshot() });

    const metadata = storedMetadata();
    const missing = ASSISTANT_TURN_ATTRIBUTION_KEYS.filter((key) => !(key in metadata));
    expect(missing, 'contract keys with no writer').toEqual([]);
  });

  it('survives a replay that carries less than the first write did', async () => {
    await persistAssistantTurn({ processed, userId: USER_ID, snapshot: snapshot() });
    const bare = { ...processed, retries: 0, usedFallback: false } as ProcessedRequest;
    await persistAssistantTurn({ processed: bare, userId: USER_ID, snapshot: snapshot() });

    const metadata = storedMetadata();
    const missing = ASSISTANT_TURN_ATTRIBUTION_KEYS.filter((key) => !(key in metadata));
    expect(missing).toEqual([]);
    expect(metadata['servedRoute']).toMatchObject({ usedFallback: false, retries: 0 });
  });

  it('records what the router asked for beside what actually answered', async () => {
    await persistAssistantTurn({ processed, userId: USER_ID, snapshot: snapshot() });

    const metadata = storedMetadata();
    expect(metadata['requestedModel']).toBe('fixture-requested-model');
    expect(metadata['servedModel']).toBe('fixture-served-model');
    expect(metadata['requestedRoute']).toEqual({
      lane: 'fixture-lane',
      slot: 'fixture-slot',
      taskType: 'fixture-task',
      planId: 'plan-1',
    });
    expect(metadata['servedRoute']).toEqual({
      provider: 'fixture-provider',
      harnessId: 'fixture-harness',
      usedFallback: true,
      fallbackReason: 'upstream_timeout',
      movedFromModel: 'fixture-pinned-model',
      retries: 2,
    });
    expect(metadata['reasoningProfile']).toEqual({
      thinking: true,
      effort: 'high',
      budgetTokens: 4096,
    });
  });

  it('names the tools offered and the evidence that any of them ran', async () => {
    await persistAssistantTurn({
      processed,
      userId: USER_ID,
      snapshot: snapshot({
        codeExecutionResult: { language: 'python', output: '42' } as never,
      }),
    });

    expect(storedMetadata()['toolInvocations']).toEqual({
      offered: ['run_code', 'web_search'],
      observed: true,
      evidenced: ['codeExecutionResult'],
    });
  });
});
