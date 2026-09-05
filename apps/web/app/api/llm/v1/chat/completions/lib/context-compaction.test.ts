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
  fingerprintManagedUsageRequest: vi.fn(() => 'request-hash'),
  reserveManagedUsageRequest: vi.fn(),
  markManagedUsageProviderStarted: vi.fn(),
  finalizeManagedUsageRequest: vi.fn(),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    estimateCost: vi.fn(() => 2),
    calculateCost: vi.fn(() => 3),
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

function buildMessages(): TrimmableMessage[] {
  const filler = (label: string) => `${label} `.repeat(400);
  return [
    { role: 'system', content: 'stay on task' },
    { role: 'user', content: filler('first-question') },
    { role: 'assistant', content: filler('first-answer') },
    { role: 'user', content: filler('second-question') },
    { role: 'assistant', content: filler('second-answer') },
    { role: 'user', content: filler('third-question') },
    { role: 'assistant', content: filler('third-answer') },
    { role: 'user', content: 'final question, keep this' },
  ];
}

function droppedPersistableCount(): number {
  const plan = planContextTrim(buildMessages(), TEST_MODEL, MAX_OUTPUT_TOKENS);
  if (!plan) throw new Error('test fixture does not overflow the fake context window');
  const messages = buildMessages();
  return plan.droppedIndices
    .map((index) => messages[index])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant').length;
}

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

function makeDb(conversationRow?: Record<string, unknown>): FakeDb {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/from web_conversations/.test(sql)) return conversationRow ? [conversationRow] : [];
    if (/from web_messages/.test(sql)) {
      const limit = params[1] as number;
      return Array.from({ length: limit }, (_, index) => ({ id: `msg-${index + 1}` }));
    }
    return [];
  });
  const execute = vi.fn(async () => 1);
  return { query, execute };
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

    expect(db.execute).toHaveBeenCalledWith(expect.any(String), [
      'Summary of earlier turns.',
      `msg-${persistableDropped}`,
      CONVERSATION_ID,
      'user-1',
    ]);
  });

  it('reuses the cached summary when the boundary is unchanged, without calling the model again', async () => {
    const persistableDropped = droppedPersistableCount();
    const boundaryId = `msg-${persistableDropped}`;
    const db = makeDb({
      compaction_summary: 'Cached summary text.',
      compaction_summary_through_message_id: boundaryId,
    });
    const messages = buildMessages();

    const result = await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(result).not.toBeNull();
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
    expect(drainToLlmResponse).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(
      messages.some(
        (message) => message.role === 'system' && message.content.includes('Cached summary text.'),
      ),
    ).toBe(true);
  });

  it('extends the cached summary by only the messages that newly fell off', async () => {
    const persistableDropped = droppedPersistableCount();
    expect(persistableDropped).toBeGreaterThanOrEqual(2);
    const staleBoundaryId = `msg-${persistableDropped - 1}`;
    const db = makeDb({
      compaction_summary: 'Prior summary text.',
      compaction_summary_through_message_id: staleBoundaryId,
    });
    const messages = buildMessages();

    await compactContextWindow(baseInput({ messages, db: db as never }));

    expect(drainToLlmResponse).toHaveBeenCalledTimes(1);
    const sentRequest = vi.mocked(openAIWireRequestToChatRequest).mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userTurn = sentRequest.messages.find((message) => message.role === 'user');
    expect(userTurn?.content).toContain('Prior summary text.');
    expect(db.execute).toHaveBeenCalledWith(expect.any(String), [
      'Summary of earlier turns.',
      `msg-${persistableDropped}`,
      CONVERSATION_ID,
      'user-1',
    ]);
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
