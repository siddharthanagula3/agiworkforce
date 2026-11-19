import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getAllowedModelsForTier,
  getDefaultModelFor,
  getEconomyFallbackModels,
  getModelMetadataById,
  listCanonicalModels,
} from '@agiworkforce/types';
import {
  MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  MAX_CHAT_COMPLETION_REQUEST_BYTES,
} from '@agiworkforce/cloud-contracts';
import type { Skill } from '@agiworkforce/skills';

import { payloadCeilingBytes } from '@/lib/payload-ceiling';
import { MAX_STATELESS_TOTAL_LENGTH } from '@/lib/validations/llm';

type ContentSafetyModule = typeof import('@/lib/services/managed-content-safety-service');
type HydrationModule = typeof import('./chat-attachment-hydration');
type MemoryContextModule = typeof import('@/lib/services/managed-memory-context-service');
type UserIdentityModule = typeof import('@/lib/server/user-identity');
type ManagedUsageModule = typeof import('@/lib/services/managed-usage-request-service');
type SkillCatalogModule = typeof import('@/lib/services/skill-catalog-service');
type PluginInstallationModule = typeof import('@/lib/services/plugin-installation-service');
type FlagEvaluationModule = typeof import('@/lib/feature-flags/flag-evaluation-service');
type RoutingTraceModule =
  typeof import('@/lib/services/model-rollout/routing-decision-trace-service');
type ContextCompactionModule = typeof import('./context-compaction');
type RlsDbModule = typeof import('@/lib/server/rls-db');

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');
const CONVERSATION_ID = '5d7e0a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b';
const FIT_BUDGET_TOKENS = 50_000;
const CHARS_PER_TOKEN = 4;

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  finalizeManagedUsage: vi.fn(),
  managedSkillCatalog: vi.fn(),
  enabledPluginIds: vi.fn(),
  persistRoutingDecision: vi.fn(),
  compactionCalls: [] as string[][],
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery, execute: vi.fn(async () => 1) },
    userId: 'user-pro',
    organizationId: null,
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<ContentSafetyModule>()),
  enforceManagedContentSafetyPreference: mocks.enforceSafety,
}));

vi.mock('./chat-attachment-hydration', async (importOriginal) => ({
  ...(await importOriginal<HydrationModule>()),
  hydrateChatAttachments: mocks.hydrate,
}));

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<MemoryContextModule>()),
  loadManagedMemoryPolicy: mocks.loadPolicy,
}));

vi.mock('@/lib/server/user-identity', async (importOriginal) => ({
  ...(await importOriginal<UserIdentityModule>()),
  buildCustomInstructionsPreamble: mocks.customInstructions,
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ManagedUsageModule>()),
  reserveManagedUsageRequest: mocks.reserveManagedUsage,
  finalizeManagedUsageRequest: mocks.finalizeManagedUsage,
}));

vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => {
  const actual = await importOriginal<SkillCatalogModule>();
  return {
    ...actual,
    getManagedSkillCatalog: mocks.managedSkillCatalog,
    getManagedSkillCatalogForPlugins: mocks.managedSkillCatalog,
    loadSelectableSkillCatalog: async (params: {
      loadEnabledPluginIds: () => Promise<ReadonlySet<string>>;
      loadInstallOverrides: () => Promise<ReadonlyMap<string, boolean>>;
    }) =>
      actual.filterSkillsByInstallOverrides(
        await mocks.managedSkillCatalog(await params.loadEnabledPluginIds()),
        await params.loadInstallOverrides(),
      ),
  };
});

vi.mock('@/lib/services/plugin-installation-service', async (importOriginal) => ({
  ...(await importOriginal<PluginInstallationModule>()),
  listEnabledPluginIds: mocks.enabledPluginIds,
}));

vi.mock('@/lib/feature-flags/flag-evaluation-service', async (importOriginal) => ({
  ...(await importOriginal<FlagEvaluationModule>()),
  evaluateFlagsForSubject: async () => ({}),
}));

vi.mock('@/lib/services/model-rollout/routing-decision-trace-service', async (importOriginal) => ({
  ...(await importOriginal<RoutingTraceModule>()),
  persistRoutingDecision: mocks.persistRoutingDecision,
}));

vi.mock('./context-compaction', async (importOriginal) => {
  const actual = await importOriginal<ContextCompactionModule>();
  return {
    ...actual,
    compactContextWindow: (input: Parameters<typeof actual.compactContextWindow>[0]) => {
      mocks.compactionCalls.push(input.messages.map((message) => message.content));
      return actual.compactContextWindow({
        ...input,
        sizing: {
          budgetTokens: FIT_BUDGET_TOKENS,
          measure: (message) => Math.ceil(message.content.length / CHARS_PER_TOKEN) + 4,
        },
      });
    },
  };
});

import { CreditService } from '@/lib/services/credit-service';
import type { AuthGateSuccess } from './auth-gate';
import {
  estimateManagedPromptTokens,
  messageLengthRefusal,
  processRequest,
} from './request-processor';

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-11-01T00:00:00Z'),
  current_period_end: new Date('2026-12-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const CATALOG: Skill[] = [];

type WireMessage = { role: 'user' | 'assistant'; content: string };

function completionRequest(
  key: string,
  messages: WireMessage[],
  conversationBound: boolean,
  model: string = PRO_CHAT_MODEL,
) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(conversationBound ? { conversation_id: CONVERSATION_ID } : {}),
    }),
  });
}

function auth(subscription = proSubscription): AuthGateSuccess {
  return { ok: true, userId: 'user-pro', token: 'session-token', subscription };
}

function savedConversationRows(sql: string) {
  return sql.includes('from web_conversations')
    ? [
        {
          id: CONVERSATION_ID,
          project_id: null,
          is_temporary: false,
          selected_route_id: null,
          instructions: null,
          agent_id: null,
        },
      ]
    : [];
}

function longHistory(messageChars: number, turns: number): WireMessage[] {
  const history: WireMessage[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    history.push({ role: 'user', content: `question ${turn} ${'q'.repeat(messageChars)}` });
    history.push({ role: 'assistant', content: `answer ${turn} ${'a'.repeat(messageChars)}` });
  }
  return history;
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { message: string; code?: string } }).error;
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) {
    if (typeof mock === 'function') mock.mockReset();
  }
  mocks.compactionCalls.length = 0;

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
    searchPastChats: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockImplementation(async (sql: string) => savedConversationRows(String(sql)));
  mocks.managedSkillCatalog.mockResolvedValue(CATALOG);
  mocks.enabledPluginIds.mockResolvedValue(new Set<string>());
  mocks.finalizeManagedUsage.mockResolvedValue({});
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'long-chat',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

describe('a saved Cloud chat is fitted to the model before any length check', () => {
  it('accepts a 150,000 character newest message that fits the context window', async () => {
    const newest = `Review this. ${'n'.repeat(150_000)}`;
    expect(newest.length).toBeGreaterThan(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH);

    const result = await processRequest(
      completionRequest('long-chat-newest', [{ role: 'user', content: newest }], true),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sentUser = result.llmRequest.messages.filter((message) => message.role === 'user');
    expect(sentUser.at(-1)?.content).toContain(newest);
  });

  it('compacts an old history over every former length limit instead of refusing it', async () => {
    const history = longHistory(300_000, 2);
    expect(history.reduce((sum, message) => sum + message.content.length, 0)).toBeGreaterThan(
      MAX_STATELESS_TOTAL_LENGTH,
    );

    const result = await processRequest(
      completionRequest(
        'long-chat-history',
        [...history, { role: 'user', content: 'What did we decide?' }],
        true,
      ),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mocks.compactionCalls).toHaveLength(1);
    expect(result.contextTrim?.droppedMessages).toBeGreaterThan(0);
    const sent = result.llmRequest.messages;
    expect(sent.some((message) => message.content.includes('q'.repeat(300_000)))).toBe(false);
    expect(sent.filter((message) => message.role === 'user').at(-1)?.content).toContain(
      'What did we decide?',
    );
  });

  it('refuses a newest message no fit can send with the message copy, after compaction', async () => {
    const result = await processRequest(
      completionRequest(
        'long-chat-too-long-for-model',
        [{ role: 'user', content: 'm'.repeat(FIT_BUDGET_TOKENS * CHARS_PER_TOKEN * 2) }],
        true,
      ),
      auth(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect((await errorOf(result.response)).code).toBe('message_too_long');
    expect(mocks.compactionCalls).toHaveLength(1);
  });

  it('measures a newest message in a dense script near one token per character', async () => {
    const newest = '長'.repeat(FIT_BUDGET_TOKENS * 2);
    expect(Math.ceil(newest.length / CHARS_PER_TOKEN)).toBeLessThan(FIT_BUDGET_TOKENS);

    const result = await processRequest(
      completionRequest('long-chat-dense-newest', [{ role: 'user', content: newest }], true),
      auth(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect((await errorOf(result.response)).code).toBe('message_too_long');
  });

  it('leaves room in the history for the real size of a dense script newest message', async () => {
    const newest = '話'.repeat(Math.floor(FIT_BUDGET_TOKENS * 0.6));
    const history = longHistory(FIT_BUDGET_TOKENS, 2);

    const result = await processRequest(
      completionRequest(
        'long-chat-dense-history',
        [...history, { role: 'user', content: newest }],
        true,
      ),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sent = result.llmRequest.messages;
    expect(sent.filter((message) => message.role === 'user').at(-1)?.content).toContain(newest);
    const historyTokens = sent
      .filter((message) => message.role !== 'system' && !message.content.includes(newest))
      .reduce((sum, message) => sum + Math.ceil(message.content.length / CHARS_PER_TOKEN) + 4, 0);
    expect(historyTokens + newest.length).toBeLessThanOrEqual(FIT_BUDGET_TOKENS);
  });

  it('refuses a newest message over the stored message cap before compaction', async () => {
    const result = await processRequest(
      completionRequest(
        'long-chat-over-cap',
        [{ role: 'user', content: 'o'.repeat(MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH + 1) }],
        true,
      ),
      auth(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect((await errorOf(result.response)).message).toBe(
      `Message content exceeds maximum length of ${MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH} characters`,
    );
    expect(mocks.compactionCalls).toHaveLength(0);
  });
});

describe('a stateless API caller', () => {
  it('keeps the total length limit for the whole request', async () => {
    const result = await processRequest(
      completionRequest(
        'long-chat-stateless-total',
        [...longHistory(300_000, 2), { role: 'user', content: 'And now?' }],
        false,
      ),
      auth(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect((await errorOf(result.response)).message).toBe(
      `Total message content exceeds maximum length of ${MAX_STATELESS_TOTAL_LENGTH} characters`,
    );
    expect(mocks.compactionCalls).toHaveLength(0);
  });

  it('no longer refuses one long earlier message inside that total', async () => {
    const result = await processRequest(
      completionRequest(
        'long-chat-stateless-history',
        [
          { role: 'user', content: 'h'.repeat(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH + 1) },
          { role: 'assistant', content: 'Noted.' },
          { role: 'user', content: 'Summarise it.' },
        ],
        false,
      ),
      auth(),
    );

    expect(result.ok).toBe(true);
  });
});

describe('messageLengthRefusal', () => {
  it('measures only the newest user message against the cap', () => {
    const overCap = 'x'.repeat(MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH + 1);
    expect(
      messageLengthRefusal(
        [
          { role: 'user', content: overCap },
          { role: 'user', content: 'short' },
        ],
        true,
      ),
    ).toBeNull();
    expect(
      messageLengthRefusal(
        [
          { role: 'user', content: 'short' },
          { role: 'user', content: [{ type: 'text', text: overCap }] },
        ],
        true,
      ),
    ).toContain('Message content exceeds maximum length');
  });
});

describe('the insufficient-credits fallback', () => {
  it('reserves for what the fallback model reads, not the first model window', async () => {
    const windowOf = (model: string) => getModelMetadataById(model)?.contextWindow ?? 0;
    const narrowestFallbackWindow = Math.min(
      ...getEconomyFallbackModels().map((fallback) => windowOf(fallback.model)),
    );
    const narrowFirst = getAllowedModelsForTier('flagship_additions')
      .filter((model) => windowOf(model) > 0 && windowOf(model) < narrowestFallbackWindow)
      .sort((left, right) => windowOf(left) - windowOf(right))[0];
    if (!narrowFirst)
      throw new Error('A Max model narrower than every economy fallback is missing');
    const firstWindow = windowOf(narrowFirst);
    const messageChars = Math.ceil((firstWindow * 3.5 * 1.05) / 4);
    vi.spyOn(CreditService, 'checkAvailableMicrousd')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);

    const result = await processRequest(
      completionRequest(
        'long-chat-credit-fallback',
        [...longHistory(messageChars, 2), { role: 'user', content: 'What did we decide?' }],
        true,
        narrowFirst,
      ),
      auth({ ...proSubscription, plan_tier: 'max' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usedFallback).toBe(true);
    expect(windowOf(result.llmRequest.model)).toBeGreaterThan(firstWindow);
    expect(result.estimatedPromptTokens).toBeGreaterThan(firstWindow);
    expect(result.estimatedPromptTokens).toBeLessThanOrEqual(windowOf(result.llmRequest.model));
  });
});

describe('the request body ceiling', () => {
  it('stays at two million bytes for completions', () => {
    expect(MAX_CHAT_COMPLETION_REQUEST_BYTES).toBe(2_000_000);
    expect(payloadCeilingBytes('/api/llm/v1/chat/completions')).toBe(
      MAX_CHAT_COMPLETION_REQUEST_BYTES,
    );
  });
});

describe('estimateManagedPromptTokens', () => {
  it('reserves no more than the selected model can read once compaction fits the chat', () => {
    const narrow = listCanonicalModels()
      .map((model) => ({
        id: model.id,
        window: getModelMetadataById(model.id)?.contextWindow ?? 0,
      }))
      .filter((model) => model.window > 0)
      .sort((left, right) => left.window - right.window)[0];
    if (!narrow) throw new Error('Canonical model with a context window is missing');
    const overWindow = 'w'.repeat(Math.ceil(narrow.window * 3.5) + 10_000);

    expect(
      estimateManagedPromptTokens({
        model: narrow.id,
        messages: [{ content: overWindow }, { content: overWindow }],
      }),
    ).toBe(narrow.window);
    expect(
      estimateManagedPromptTokens({ model: narrow.id, messages: [{ content: 'hello there' }] }),
    ).toBe(Math.ceil('hello there'.length / 3.5) + 4);
  });
});
