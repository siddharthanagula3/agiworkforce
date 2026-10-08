import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import {
  canAccessModelForSubscriptionTier,
  getManualOverrideModelIds,
  getModelMetadataById,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/connectors/mcp-context-service');
type ScanModule1 = typeof import('@/lib/server/rls-db');
type ScanModule2 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule3 = typeof import('./chat-attachment-hydration');
type ScanModule4 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule5 = typeof import('@/lib/server/user-identity');
type ScanModule6 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule7 = typeof import('@/lib/services/provider-adapter-service');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  managedProviderIds: vi.fn<() => Set<string> | null>(() => null),
  loadMcpContext: vi.fn(),
}));

vi.mock('@/lib/connectors/mcp-context-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  loadSelectedMcpContext: mocks.loadMcpContext,
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
    organizationId: null,
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

function catalogProviders(): string[] {
  return getManualOverrideModelIds().flatMap((modelId) => {
    const provider = getModelMetadataById(modelId)?.provider;
    return provider ? [provider] : [];
  });
}

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule7>();
  return {
    ...actual,
    listAvailableManagedProviderIds: () =>
      mocks.managedProviderIds() ??
      new Set([...actual.listAvailableManagedProviderIds(), ...catalogProviders()]),
  };
});

import { CreditService } from '@/lib/services/credit-service';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { processRequest } from './request-processor';

const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-09-01T00:00:00Z'),
  current_period_end: new Date('2026-10-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const trainingModel = getManualOverrideModelIds().find(
  (modelId) =>
    canAccessModelForSubscriptionTier(modelId, 'pro') &&
    getModelMetadataById(modelId)?.capabilities?.tools === true &&
    !modelKeepsInputsOutOfTraining(modelId),
);

interface AccountState {
  connectedGoogle: string[];
  conversationMarked: boolean;
}

function serveAccount(state: AccountState): void {
  mocks.scopedQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('connector_oauth_grants')) {
      return state.connectedGoogle.map((connector_id) => ({ connector_id }));
    }
    if (sql.includes('google_user_data_at is not null as marked')) {
      return [{ marked: state.conversationMarked, project_id: null }];
    }
    if (sql.includes('from web_conversations c') && sql.includes('is_temporary')) {
      return [
        {
          id: CONVERSATION_ID,
          project_id: null,
          is_temporary: false,
          selected_route_id: null,
          study_topic: null,
          study_mode: null,
          study_level: null,
        },
      ];
    }
    return [];
  });
}

function run(
  key: string,
  model: string,
  extra: Record<string, unknown> = {},
  messages: unknown[] = [{ role: 'user', content: 'Summarize the notes I pasted below.' }],
) {
  return processRequest(
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({ model, messages, stream: false, ...extra }),
    }),
    { ok: true, userId: 'user-pro', token: 'session-token', subscription: proSubscription },
  );
}

async function errorOf(result: Awaited<ReturnType<typeof run>>) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return { status: result.response.status, body: await result.response.json() };
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.managedProviderIds.mockReturnValue(null);
  mocks.loadMcpContext.mockResolvedValue('Selected context');
  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: { query: mocks.scopedQuery },
      userId: 'user-pro',
      idempotencyKey: 'lease-key',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );
  serveAccount({ connectedGoogle: [], conversationMarked: false });

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 1_000_000,
    credits_remaining_cents: 990_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

describe('Google user data only reaches providers that keep inputs out of training', () => {
  it('needs a Pro model whose provider may train on inputs', () => {
    expect(trainingModel, 'the catalog must offer a Pro model that may train').toBeDefined();
  });

  it('serves a model that may train when no Google data can reach the turn', async () => {
    const result = await run('google-none', trainingModel!);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.googleUserData).toBe(false);
  });

  it('refuses a model that may train while a Google connector is on for the turn', async () => {
    serveAccount({ connectedGoogle: ['gmail'], conversationMarked: false });

    const { status, body } = await errorOf(await run('google-connected', trainingModel!));

    expect(status).toBe(403);
    expect(body.error).toMatchObject({
      code: 'model_may_train',
      message: expect.stringContaining('turn off your Google connectors for this chat'),
    });
  });

  it('routes Auto only to providers that keep inputs out of training while a Google connector is on', async () => {
    serveAccount({ connectedGoogle: ['google-drive'], conversationMarked: false });

    const result = await run('google-connected-auto', 'auto');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.googleUserData).toBe(true);
    expect(modelKeepsInputsOutOfTraining(result.chatRequest.model)).toBe(true);
    for (const fallback of result.fallbackModels ?? []) {
      expect(modelKeepsInputsOutOfTraining(fallback)).toBe(true);
    }
    for (const route of result.fallbackRoutes ?? []) {
      expect(providerKeepsInputsOutOfTraining(route.provider)).toBe(true);
    }
    expect(result.noTrainingOnly).toBe(true);
  });

  it('leaves managed failover ungoverned by the opt-out when no Google data can reach the turn', async () => {
    const result = await run('google-none-auto', 'auto');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noTrainingOnly).toBeUndefined();
  });

  it('serves a model that may train when the only Google connector is off for this chat', async () => {
    serveAccount({ connectedGoogle: ['gmail'], conversationMarked: false });

    const result = await run('google-disabled', trainingModel!, {
      disabled_connector_ids: ['gmail'],
    });

    expect(result.ok).toBe(true);
  });

  it('keeps a later plain-text turn off training providers once Google data entered the conversation', async () => {
    serveAccount({ connectedGoogle: [], conversationMarked: true });

    const { status, body } = await errorOf(
      await run('google-sticky', trainingModel!, {
        conversation_id: CONVERSATION_ID,
        connector_tools_enabled: false,
      }),
    );

    expect(status).toBe(403);
    expect(body.error).toMatchObject({
      code: 'model_may_train',
      message: expect.stringContaining('This chat includes data from your Google account'),
    });
  });

  it('treats a Google tool call in the sent history as Google data in the conversation', async () => {
    const { status, body } = await errorOf(
      await run('google-history', trainingModel!, { connector_tools_enabled: false }, [
        { role: 'user', content: 'What did Ana send me?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'mcp__gmail__search_threads', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: 'Thread: lunch on Friday' },
        { role: 'assistant', content: 'Ana asked about lunch on Friday.' },
        { role: 'user', content: 'Draft a reply to this text I pasted.' },
      ]),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe('model_may_train');
  });

  it('treats Google MCP context the user selected like a Google tool call', async () => {
    const { status, body } = await errorOf(
      await run('google-mcp-context-explicit', trainingModel!, {
        connector_tools_enabled: false,
        mcp_context: { resources: [{ connectorId: 'google-drive', uri: 'drive://file/1' }] },
      }),
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe('model_may_train');

    const result = await run('google-mcp-context-auto', 'auto', {
      conversation_id: CONVERSATION_ID,
      connector_tools_enabled: false,
      mcp_context: { prompt: { connectorId: 'gmail', name: 'summarize_inbox' } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.googleUserData).toBe(true);
    expect(modelKeepsInputsOutOfTraining(result.chatRequest.model)).toBe(true);
    const marked = mocks.scopedQuery.mock.calls.find(([sql]) =>
      String(sql).includes('set google_user_data_at = now()'),
    );
    expect(marked?.[1]).toEqual([CONVERSATION_ID, 'user-pro']);
  });

  it('refuses with curated copy when no provider that keeps inputs out of training is available', async () => {
    serveAccount({ connectedGoogle: ['gmail'], conversationMarked: true });
    mocks.managedProviderIds.mockReturnValue(
      new Set(
        [getModelMetadataById(trainingModel!)!.provider].filter(
          (provider) => !providerKeepsInputsOutOfTraining(provider),
        ),
      ),
    );

    const { status, body } = await errorOf(
      await run('google-no-route', 'auto', { conversation_id: CONVERSATION_ID }),
    );

    expect(status).toBe(403);
    expect(body.error).toMatchObject({
      code: 'no_training_model_available',
      message:
        'This chat includes data from your Google account, and no model on your plan that keeps it out of training is available right now. Try again later.',
    });
  });
});
