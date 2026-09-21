import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TEST_MODEL = 'context-compaction-test-model';

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    getModelMetadataById: vi.fn((id?: string) =>
      id === TEST_MODEL ? { id: TEST_MODEL, contextWindow: 500, provider: 'openai' } : undefined,
    ),
  };
});
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  estimateMicrousdOf: (source: { estimatedCostMicrousd?: number; estimatedCostCents: number }) =>
    source.estimatedCostMicrousd ?? Math.round(source.estimatedCostCents) * 10_000,

  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(),
  markManagedUsageProviderStarted: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateListCost: vi.fn(() => null),
    calculateListCostMicrousd: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateListCostMicrousd: vi.fn(() => null),
    estimateCost: vi.fn(() => 2),
    estimateCostMicrousd: vi.fn(() => 20000),
    calculateCost: vi.fn(() => 3),
    calculateCostMicrousd: vi.fn(() => 30000),
  },
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(),
  toGenericUpstreamError: vi.fn(
    (provider: string, chunk: { message?: string }) =>
      new Error(`${provider}: ${chunk?.message ?? 'error'}`),
  ),
  buildProtocolRouteAdapter: vi.fn(),
}));
vi.mock('./adapter-response', () => ({
  drainToLlmResponse: vi.fn(),
}));
vi.mock('@agiworkforce/provider-protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/provider-protocol')>();
  return { ...actual, openAIWireRequestToChatRequest: vi.fn((value: unknown) => value) };
});

import {
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { drainToLlmResponse } from './adapter-response';
import { DROPPED_HISTORY_MARKER, planContextTrim, type TrimmableMessage } from './context-window';
import {
  compactContextWindow,
  CONTEXT_COMPACTION_ENABLED_ENV,
  resolveContextCompactionEnabled,
  type ContextCompactionInput,
} from './context-compaction';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MAX_OUTPUT_TOKENS = 256;

const TURN_LABELS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'] as const;

function buildMessages(turns = 3): TrimmableMessage[] {
  const filler = (label: string) => `${label} `.repeat(400);
  const messages: TrimmableMessage[] = [{ role: 'system', content: 'stay on task' }];
  for (const label of TURN_LABELS.slice(0, turns)) {
    messages.push({ role: 'user', content: filler(`${label}-question`) });
    messages.push({ role: 'assistant', content: filler(`${label}-answer`) });
  }
  messages.push({ role: 'user', content: 'final question, keep this' });
  return messages;
}

function droppedPersistableCount(turns = 3): number {
  const plan = planContextTrim(buildMessages(turns), TEST_MODEL, MAX_OUTPUT_TOKENS);
  if (!plan) throw new Error('test fixture does not overflow the fake context window');
  const messages = buildMessages(turns);
  return plan.droppedIndices
    .map((index) => messages[index])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant').length;
}

/**
 * Message rows as Postgres holds them: a soft delete leaves the row in place,
 * an edit bumps server_version, and both are invisible to a reader that filters.
 */
interface StoredMessage {
  id: string;
  version: number;
  deletedAt: string | null;
}

interface StoredConversation {
  compaction_summary: string | null;
  compaction_summary_through_message_id: string | null;
  compaction_summary_digest: string | null;
  deleted_at: string | null;
}

function storedMessages(count: number): StoredMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `msg-${index + 1}`,
    version: index + 1,
    deletedAt: null,
  }));
}

function emptyConversation(): StoredConversation {
  return {
    compaction_summary: null,
    compaction_summary_through_message_id: null,
    compaction_summary_digest: null,
    deleted_at: null,
  };
}

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  conversation: StoredConversation;
  messages: StoredMessage[];
}

/**
 * Answers the way Postgres would, predicate by predicate: a filter the
 * statement does not spell is a filter the rows do not get.
 */
function makeDb(
  options: { conversation?: StoredConversation; messages?: StoredMessage[] } = {},
): FakeDb {
  const conversation = options.conversation ?? emptyConversation();
  const messages = options.messages ?? storedMessages(24);

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (/from web_conversations/.test(text)) {
      if (/deleted_at is null/.test(text) && conversation.deleted_at !== null) return [];
      return [conversation];
    }
    if (/from web_messages/.test(text)) {
      const visible = /deleted_at is null/.test(text)
        ? messages.filter((message) => message.deletedAt === null)
        : messages;
      const limit = Number(params[1]);
      return visible
        .slice(0, limit)
        .map((message) => ({ id: message.id, server_version: String(message.version) }));
    }
    return [];
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (/update web_conversations/.test(text) && /compaction_summary/.test(text)) {
      conversation.compaction_summary = params[0] as string;
      conversation.compaction_summary_through_message_id = params[1] as string;
      conversation.compaction_summary_digest = (params[2] ?? null) as string | null;
    }
    return 1;
  });

  return { query, execute, conversation, messages };
}

const SELECTED_ROUTE = {
  status: 'selected' as const,
  requestedSelection: 'auto',
  requestedProfile: null,
  effectiveProfile: null,
  taskType: 'simple_chat',
  modelKey: 'model-key',
  provider: 'openai',
  providerModelId: 'provider-model-id',
  routeId: 'route-1',
  harnessId: 'managed/chat',
  fallbacks: [],
  reason: 'preferred_slot' as const,
};

function baseInput(overrides: Partial<ContextCompactionInput> = {}): ContextCompactionInput {
  return {
    messages: buildMessages(),
    model: TEST_MODEL,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    db: makeDb() as never,
    userId: 'user-1',
    organizationId: 'org-1',
    conversationId: CONVERSATION_ID,
    isTemporary: false,
    planTier: 'pro',
    resolveEconomyRoute: vi.fn(() => SELECTED_ROUTE) as never,
    ...overrides,
  };
}

function summarySentToModel(call = 0): string {
  const request = vi.mocked(openAIWireRequestToChatRequest).mock.calls[call]?.[0] as {
    messages: Array<{ role: string; content: string }>;
  };
  return request.messages.find((message) => message.role === 'user')?.content ?? '';
}

describe('resolveContextCompactionEnabled', () => {
  afterEach(() => {
    delete process.env[CONTEXT_COMPACTION_ENABLED_ENV];
  });

  it.each([
    [undefined, true],
    ['1', true],
    ['true', true],
    ['0', false],
    ['false', false],
    ['off', false],
    ['OFF', false],
  ])('treats %s as enabled=%s', (value, expected) => {
    if (value === undefined) delete process.env[CONTEXT_COMPACTION_ENABLED_ENV];
    else process.env[CONTEXT_COMPACTION_ENABLED_ENV] = value;
    expect(resolveContextCompactionEnabled()).toBe(expected);
  });
});

describe('compactContextWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[CONTEXT_COMPACTION_ENABLED_ENV];
    vi.mocked(reserveManagedUsageRequest).mockResolvedValue({
      db: {} as never,
      userId: 'user-1',
      idempotencyKey: 'context-compaction:test',
      requestHash: 'request-hash',
      leaseToken: 'lease-1',
      estimatedCostCents: 2,
    } as never);
    vi.mocked(markManagedUsageProviderStarted).mockResolvedValue();
    vi.mocked(finalizeManagedUsageRequest).mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 3,
    });
    vi.mocked(buildServerProviderAdapter).mockReturnValue({
      stream: vi.fn(() => ({}) as never),
    } as never);
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: 'model-key',
      content: 'Summary of earlier turns.',
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });
  });

  it('returns null when nothing needs to be dropped', async () => {
    const db = makeDb();
    const result = await compactContextWindow(
      baseInput({ messages: [{ role: 'user', content: 'hi' }], db: db as never }),
    );

    expect(result).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('summarizes the whole dropped span when there is no cached boundary, and caches it', async () => {
    const persistableDropped = droppedPersistableCount();
    const db = makeDb();
    const messages = buildMessages();

    const result = await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(result).not.toBeNull();
    expect(reserveManagedUsageRequest).toHaveBeenCalledTimes(1);
    expect(drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed' }),
    );
    expect(
      messages.some(
        (message) =>
          message.role === 'system' && message.content.includes('Summary of earlier turns.'),
      ),
    ).toBe(true);

    expect(db.conversation.compaction_summary).toBe('Summary of earlier turns.');
    expect(db.conversation.compaction_summary_through_message_id).toBe(`msg-${persistableDropped}`);
    expect(db.conversation.compaction_summary_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reuses the cached summary when the boundary and the span are unchanged', async () => {
    const db = makeDb();
    await compactContextWindow(baseInput({ messages: buildMessages(), db: db as never }));
    vi.clearAllMocks();

    const messages = buildMessages();
    const result = await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(result).not.toBeNull();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(drainToLlmResponse).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(
      messages.some(
        (message) =>
          message.role === 'system' && message.content.includes('Summary of earlier turns.'),
      ),
    ).toBe(true);
  });

  it('extends the cached summary by only the messages that newly fell off', async () => {
    const shortSpan = droppedPersistableCount(3);
    const longSpan = droppedPersistableCount(6);
    expect(longSpan).toBeGreaterThan(shortSpan);

    const db = makeDb();
    await compactContextWindow(baseInput({ messages: buildMessages(3), db: db as never }));
    vi.clearAllMocks();
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: 'model-key',
      content: 'Combined summary.',
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });

    await compactContextWindow(baseInput({ messages: buildMessages(6), db: db as never }));

    expect(drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(summarySentToModel()).toContain('Summary of earlier turns.');
    expect(db.conversation.compaction_summary).toBe('Combined summary.');
    expect(db.conversation.compaction_summary_through_message_id).toBe(`msg-${longSpan}`);
  });

  it('anchors the boundary to the nth visible message, not the nth row', async () => {
    const persistableDropped = droppedPersistableCount();
    const messages = storedMessages(24);
    messages[0]!.deletedAt = '2026-09-19T00:00:00.000Z';
    messages[2]!.deletedAt = '2026-09-19T00:00:00.000Z';
    const db = makeDb({ messages });

    await compactContextWindow(baseInput({ messages: buildMessages(), db: db as never }));

    expect(db.conversation.compaction_summary_through_message_id).toBe(
      `msg-${persistableDropped + 2}`,
    );
  });

  it('retires the cached summary when a message inside the span is deleted', async () => {
    const db = makeDb();
    await compactContextWindow(baseInput({ messages: buildMessages(), db: db as never }));
    const staleSummary = db.conversation.compaction_summary;
    vi.clearAllMocks();
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: 'model-key',
      content: 'Summary without the deleted turn.',
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });

    db.messages[2]!.deletedAt = '2026-09-19T00:00:00.000Z';

    const messages = buildMessages();
    await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(summarySentToModel()).not.toContain(staleSummary);
    expect(db.conversation.compaction_summary).toBe('Summary without the deleted turn.');
    expect(
      messages.some((message) => message.content.includes('Summary without the deleted turn.')),
    ).toBe(true);
  });

  it('retires the cached summary when a message inside the span is edited', async () => {
    const db = makeDb();
    await compactContextWindow(baseInput({ messages: buildMessages(), db: db as never }));
    const staleSummary = db.conversation.compaction_summary;
    vi.clearAllMocks();
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: 'model-key',
      content: 'Summary of the edited turns.',
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });

    db.messages[1]!.version = 900;

    await compactContextWindow(baseInput({ messages: buildMessages(), db: db as never }));

    expect(drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(summarySentToModel()).not.toContain(staleSummary);
    expect(db.conversation.compaction_summary).toBe('Summary of the edited turns.');
  });

  it('does not carry a stale summary forward as the prior summary when the span changed', async () => {
    const db = makeDb();
    await compactContextWindow(baseInput({ messages: buildMessages(3), db: db as never }));
    const staleSummary = db.conversation.compaction_summary;
    expect(staleSummary).toBe('Summary of earlier turns.');
    vi.clearAllMocks();
    vi.mocked(drainToLlmResponse).mockResolvedValue({
      model: 'model-key',
      content: 'Rebuilt summary.',
      promptTokens: 50,
      completionTokens: 20,
      totalTokens: 70,
    });

    db.messages[1]!.deletedAt = '2026-09-19T00:00:00.000Z';

    await compactContextWindow(baseInput({ messages: buildMessages(6), db: db as never }));

    expect(drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(summarySentToModel()).not.toContain(staleSummary);
  });

  it('does not compact a withdrawn conversation', async () => {
    const db = makeDb({
      conversation: { ...emptyConversation(), deleted_at: '2026-09-19T00:00:00.000Z' },
    });
    const messages = buildMessages();

    const result = await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(result).not.toBeNull();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(drainToLlmResponse).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(messages.some((message) => message.content === DROPPED_HISTORY_MARKER)).toBe(true);
  });

  it('falls back to the mechanical trim when the kill switch is off', async () => {
    process.env[CONTEXT_COMPACTION_ENABLED_ENV] = '0';
    const db = makeDb();
    const messages = buildMessages();

    const result = await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(result).not.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(messages.some((message) => message.content === DROPPED_HISTORY_MARKER)).toBe(true);
  });

  it('falls back to the mechanical trim when summarization fails', async () => {
    vi.mocked(reserveManagedUsageRequest).mockRejectedValueOnce(new Error('billing unavailable'));
    const db = makeDb();
    const messages = buildMessages();

    const result = await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(result).not.toBeNull();
    expect(messages.some((message) => message.content === DROPPED_HISTORY_MARKER)).toBe(true);
  });

  it('falls back to the mechanical trim when no economy route is available', async () => {
    const unavailableRoute = vi.fn(() => ({
      status: 'unavailable' as const,
      code: 'no_eligible_route' as const,
      requestedSelection: 'auto',
      requestedProfile: null,
      effectiveProfile: null,
      taskType: 'simple_chat',
      reasons: ['no eligible route'],
    }));
    const db = makeDb();
    const messages = buildMessages();

    const result = await compactContextWindow(
      baseInput({ messages, db: db as never, resolveEconomyRoute: unavailableRoute as never }),
    );

    expect(result).not.toBeNull();
    expect(messages.some((message) => message.content === DROPPED_HISTORY_MARKER)).toBe(true);
  });

  it('skips compaction for a temporary conversation', async () => {
    const db = makeDb();
    const messages = buildMessages();

    await compactContextWindow(baseInput({ messages, db: db as never, isTemporary: true }));

    expect(db.query).not.toHaveBeenCalled();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('skips compaction when there is no conversation row to cache against', async () => {
    const db = makeDb();
    const messages = buildMessages();

    await compactContextWindow(
      baseInput({ messages, db: db as never, conversationId: null, organizationId: null }),
    );

    expect(db.query).not.toHaveBeenCalled();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });
});
