import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: Promise<unknown>) => fn };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SELECTED_ROUTE = {
  status: 'selected' as const,
  requestedSelection: 'auto',
  requestedProfile: null,
  effectiveProfile: 'balanced',
  taskType: 'simple_chat',
  modelKey: 'test.model',
  provider: 'anthropic',
  providerModelId: 'test-provider-model-id',
  routeId: 'test-route',
  harnessId: 'test/chat',
  fallbacks: [],
  reason: 'preferred_slot',
};

const resolveAutoRouteMock = vi.fn(() => SELECTED_ROUTE);
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  return { ...actual, resolveAutoRoute: () => resolveAutoRouteMock() };
});

const drainToLlmResponseMock = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: () => ({ stream: () => (async function* () {})() }),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
}));

class FakeRedis {
  store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set(key: string, value: unknown): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
}

let redisClient: FakeRedis | null = null;
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () =>
    redisClient ? createUpstashKeyValueStore(redisClient as unknown as UpstashRedisLike) : null,
}));

import { createUpstashKeyValueStore, type UpstashRedisLike } from '@agiworkforce/key-value';

import {
  scheduleConversationTitleGeneration,
  type ScheduleTitleGenerationInput,
} from './generate-title';

const CONVERSATION_ID = 'conv_1';
const USER_ID = 'user_1';

function fakeDb(overrides: { isTemporary?: boolean } = {}) {
  const executed: unknown[][] = [];
  return {
    query: vi.fn(async () => [{ is_temporary: overrides.isTemporary ?? false }]),
    execute: vi.fn(async (_sql: string, params?: unknown[]) => {
      executed.push(params ?? []);
      return 1;
    }),
    executed,
  };
}

function scheduleInput(
  db: ReturnType<typeof fakeDb>,
  overrides: Partial<ScheduleTitleGenerationInput> = {},
): ScheduleTitleGenerationInput {
  return {
    db: db as unknown as ScheduleTitleGenerationInput['db'],
    conversationId: CONVERSATION_ID,
    userId: USER_ID,
    organizationId: null,
    content: 'help me refactor the authentication module please',
    expectedCurrentTitle: 'help me refactor the authentication module pl...',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redisClient = new FakeRedis();
  resolveAutoRouteMock.mockReturnValue(SELECTED_ROUTE);
  drainToLlmResponseMock.mockResolvedValue({
    model: 'test.model',
    content: 'Refactor auth module',
    promptTokens: 12,
    completionTokens: 4,
    totalTokens: 16,
  });
});

describe('exact-response cache integration', () => {
  it('calls the provider on the first request and reuses the cached title on an identical second request', async () => {
    const dbFirst = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbFirst));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(dbFirst.executed[0]?.[0]).toBe('Refactor auth module');

    const dbSecond = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbSecond));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(dbSecond.executed[0]?.[0]).toBe('Refactor auth module');
  });

  it('bypasses the cache for a temporary conversation and never reads or writes a cached entry', async () => {
    const db = fakeDb({ isTemporary: true });
    scheduleConversationTitleGeneration(scheduleInput(db));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(redisClient!.store.size).toBe(0);

    const dbSecond = fakeDb({ isTemporary: true });
    scheduleConversationTitleGeneration(scheduleInput(dbSecond));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
  });

  it('keeps two different users on two different first messages from colliding', async () => {
    const dbUserOne = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbUserOne, { userId: 'user_a' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);

    const dbUserTwo = fakeDb();
    scheduleConversationTitleGeneration(scheduleInput(dbUserTwo, { userId: 'user_b' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
  });
});
