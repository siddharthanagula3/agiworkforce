// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { FREE_QUOTA_FALLBACK_REQUEST_KEY } from '@agiworkforce/cloud-contracts';
import { getProviderOfferings, getRoutingSlotModel } from '@agiworkforce/types';
import {
  credentialSha256,
  readFreeQuotaState,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { loadFreePools } from '@/lib/server/free-pools';
import { freeQuotaFixtureNow, servableFreeQuotaOfferings } from '@/test/free-quota-fixtures';
type ScanModule0 = typeof import('@/lib/server/key-value');
type ScanModule1 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule2 = typeof import('@/lib/managed-compute-gate');
type ScanModule3 = typeof import('@/lib/services/organization-policy-gate');
type ScanModule4 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule5 = typeof import('@/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration');
type ScanModule6 = typeof import('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate');
type ScanModule7 = typeof import('@/lib/server/free-pools');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  query: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  otherProvider: vi.fn(),
  plan: vi.fn(),
  persistUser: vi.fn(),
  hydrate: vi.fn(),
}));

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  resolveEntitledPlanTier: mocks.plan,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildProviderEgressGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  evaluateActiveWorkspacePolicy: vi.fn(async () => ({ allowed: true })),
  resolveZeroDataRetentionPolicy: vi.fn(async () => ({ required: false })),
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
}));
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration',
  async (importOriginal) => ({
    ...(await importOriginal<ScanModule5>()),
    hydrateChatAttachments: mocks.hydrate,
  }),
);
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/persist-message', () => ({
  persistConversationMessage: mocks.persistUser,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  applySecretHandlingToTexts: vi.fn(async (_user: string, texts: string[]) => ({
    action: 'clean',
    texts,
  })),
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule7>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const inventory = document.inventory!;
      return {
        ...document,
        inventory: {
          ...inventory,
          termsReview: {
            terms: {
              commercialUseAllowed: true,
              thirdPartyServingAllowed: true,
              proxyingAllowed: true,
              promptsExcludedFromTraining: true,
            },
            evidenceUrl: 'https://provider.example/terms',
            reviewedBy: 'fixture-reviewer',
            verifiedAtMs: Date.now() - 60_000,
            expiresAtMs: Date.now() + 86_400_000,
            approvedOfferingKeys: inventory.entries.map((entry) => entry.offeringKey),
          },
        },
      };
    },
  };
});
vi.mock('@agiworkforce/providers-factory', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const guarded = Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (...args: unknown[]) => {
            mocks.otherProvider(name, ...args);
            throw new Error(`${name} is not a free quota path`);
          }
        : value,
    ]),
  );
  return { ...guarded, streamQwenQuotaChat: mocks.stream, runQwenQuotaProbe: mocks.media };
});

const { freeQuotaFallbackReplay, serveFreeQuotaFallback } = await import('./free-quota-fallback');

const API_KEY = 'fixture-provider-key';
const FREE_AUTO = getRoutingSlotModel('router_zero_cost');
const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';
const ASSISTANT_ID = '62d14f7e-0b3d-40c7-952d-987e841033c5';
const USER_MESSAGE_ID = '72d14f7e-0b3d-40c7-952d-987e841033c5';
const ASSET_ID = 'a2d14f7e-0b3d-40c7-952d-987e841033c5';
const inventory = loadFreePools().inventory!;
const NOW = freeQuotaFixtureNow(inventory);
const servableChat = servableFreeQuotaOfferings(inventory, { apiKey: API_KEY, nowMs: NOW }).filter(
  ({ offering }) => offering.quotaProbeProtocol === 'chat',
);
const textOnlyKeys = servableChat
  .filter(({ offering }) => offering.quotaChatImageInput !== true)
  .map(({ key }) => key);

function refusal(code: string, status = 429): Response {
  return Response.json({ error: { code, message: 'Free Auto could not answer.' } }, { status });
}

const QUESTION = { role: 'user', content: 'Explain photosynthesis in two sentences.' };

function freeAutoBody(patch: Record<string, unknown> = {}) {
  return {
    model: FREE_AUTO,
    stream: true,
    conversation_id: CONVERSATION_ID,
    assistant_message_id: ASSISTANT_ID,
    user_message: { id: USER_MESSAGE_ID, metadata: {} },
    messages: [QUESTION],
    [FREE_QUOTA_FALLBACK_REQUEST_KEY]: true,
    ...patch,
  };
}

const EXTENSION_TURN = {
  model: FREE_AUTO,
  messages: [QUESTION],
  stream: true,
  x_interactive_cards: {
    supported: ['clarify.v1', 'itinerary.v1', 'map-search.v1', 'product-comparison.v1'],
    canRespond: true,
  },
  conversation_id: CONVERSATION_ID,
  assistant_message_id: ASSISTANT_ID,
};

const DESKTOP_TURN = {
  model: FREE_AUTO,
  messages: [QUESTION],
  conversation_id: CONVERSATION_ID,
  stream: true,
  assistant_message_id: ASSISTANT_ID,
  client_timezone: 'Europe/London',
  use_prompt_cache: true,
};

function chatRequest(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'fixture-turn', authorization: 'Bearer fixture-token' },
    body: JSON.stringify(body),
  });
}

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function fallBack(refused: Response, body: unknown = freeAutoBody()) {
  const request = chatRequest(body);
  const replay = freeQuotaFallbackReplay(request, { planTier: 'free', viaApiKey: false });
  if (!replay) throw new Error('A Free plan request must be replayable');
  await request.text();
  return serveFreeQuotaFallback({
    request,
    replay,
    refusal: refused,
    userId: 'fixture-user',
    scopedDb: async () => ({
      userId: 'fixture-user',
      organizationId: null,
      db: { query: mocks.query } as never,
    }),
  });
}

async function attest(quotaOnlyOfferings: 'all' | string[] = 'all') {
  await writeQuotaAttestation(mocks.store, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings,
    attestedBy: 'fixture-operator',
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.query.mockReset().mockResolvedValue([{ id: 'conversation', data_region: null }]);
  mocks.plan.mockReset().mockResolvedValue('free');
  mocks.stream.mockReset();
  mocks.media.mockReset();
  mocks.otherProvider.mockReset();
  mocks.persistUser.mockReset().mockResolvedValue({ id: USER_MESSAGE_ID });
  mocks.hydrate.mockReset().mockImplementation(async (messages) => {
    const latest = messages.at(-1);
    if (latest && Array.isArray(latest.content)) {
      latest.content = latest.content.map((part: { type: string }) =>
        part.type === 'file'
          ? { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
          : part,
      );
      return [{ filename: 'image.png', mimeType: 'image/png', base64: 'aW1hZ2U=' }];
    }
    return [];
  });
  await attest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Free Auto falls back to a ready free quota model on the server', () => {
  it.each([
    ['free_allowance_exhausted', 'free_limit_reached'],
    ['free_capacity_unavailable', 'free_capacity_unavailable'],
  ])('answers a turn refused with %s and names the reason %s', async (code, reason) => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [{ index: 0, delta: { content: 'Answered for free.' }, finish_reason: null }],
        }),
        '[DONE]',
      ),
    );

    const served = await fallBack(refusal(code));

    expect(served?.status).toBe(200);
    expect(served?.headers.get('X-AGI-Fallback-Reason')).toBe(reason);
    const resolved = served?.headers.get('X-AGI-Resolved-Model');
    expect(servableChat.map(({ key }) => key)).toContain(resolved);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0]![0]).toBe(resolved);
    expect(await served!.text()).toContain('Answered for free.');
    expect(mocks.otherProvider).not.toHaveBeenCalled();
  });

  it('leaves the user message to the turn that already saved it', async () => {
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    await fallBack(refusal('free_allowance_exhausted'));
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.persistUser).not.toHaveBeenCalled();
  });

  it('sends earlier attachments as text and the current image to a model that reads images', async () => {
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    const served = await fallBack(
      refusal('free_allowance_exhausted'),
      freeAutoBody({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Earlier photo' },
              { type: 'file', file: { asset_id: ASSET_ID } },
            ],
          },
          { role: 'assistant', content: 'A cat on a sofa.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this one?' },
              { type: 'file', file: { asset_id: ASSET_ID } },
            ],
          },
        ],
      }),
    );

    expect(served?.status).toBe(200);
    const resolved = served!.headers.get('X-AGI-Resolved-Model')!;
    expect(getProviderOfferings()[resolved]!.quotaChatImageInput).toBe(true);
    const sent = mocks.stream.mock.calls[0]![3].messages as { role: string; content: unknown }[];
    expect(sent.find((message) => message.role === 'user')!.content).toContain('Earlier photo');
  });

  it.each([
    ['a refusal that is not a spent free lane', refusal('provider_unreachable', 502), {}],
    [
      'an account that reached its own free usage limit',
      refusal('free_trial_token_budget_reached'),
      {},
    ],
    ['a model the reader picked', refusal('free_allowance_exhausted'), { model: textOnlyKeys[0] }],
    ['a turn that is not streamed', refusal('free_allowance_exhausted'), { stream: false }],
    ['web search', refusal('free_allowance_exhausted'), { web_search: true }],
    [
      'a search the composer asked for',
      refusal('free_allowance_exhausted'),
      { search_requested: true },
    ],
    [
      'a search the message asks for',
      refusal('free_allowance_exhausted'),
      { messages: [{ role: 'user', content: 'Search the web for the latest news about Mars.' }] },
    ],
    ['code execution', refusal('free_allowance_exhausted'), { code_execution: true }],
    ['research', refusal('free_allowance_exhausted'), { research: true }],
    ['AGI Work', refusal('free_allowance_exhausted'), { work_mode: 'agiwork' }],
    ['a skill', refusal('free_allowance_exhausted'), { skill_name: 'fixture-skill' }],
    [
      'client tools',
      refusal('free_allowance_exhausted'),
      { tools: [{ type: 'function', function: { name: 'fixture', parameters: {} } }] },
    ],
    [
      'a memory command',
      refusal('free_allowance_exhausted'),
      { memory_command: { kind: 'remember', status: 'saved' } },
    ],
  ])('keeps the Free Auto refusal for %s', async (_label, refused, patch) => {
    const served = await fallBack(refused, freeAutoBody(patch));
    expect(served).toBeNull();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it.each([
    ['the browser extension', EXTENSION_TURN],
    ['the desktop app', DESKTOP_TURN],
    [
      'a web turn that did not ask for it',
      freeAutoBody({ [FREE_QUOTA_FALLBACK_REQUEST_KEY]: false }),
    ],
  ])(
    'keeps the Free Auto refusal for %s, which would not say another model answered',
    async (_client, body) => {
      mocks.stream.mockResolvedValue(sse('[DONE]'));
      expect(await fallBack(refusal('free_allowance_exhausted'), body)).toBeNull();
      expect(mocks.stream).not.toHaveBeenCalled();
    },
  );

  it('keeps the Free Auto refusal when no free quota model is ready', async () => {
    mocks.store = createMemoryKeyValueStore();
    expect(await fallBack(refusal('free_allowance_exhausted'))).toBeNull();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('keeps the Free Auto refusal when the free model refuses too, and records its limit', async () => {
    mocks.stream.mockResolvedValue(
      Response.json({ error: { code: 'AllocationQuota.FreeTierOnly' } }, { status: 403 }),
    );
    expect(await fallBack(refusal('free_allowance_exhausted'))).toBeNull();
    const [tried] = mocks.stream.mock.calls[0]!;
    const state = await readFreeQuotaState(mocks.store, {
      apiKey: API_KEY,
      observedOn: inventory.observedOn,
      offeringKeys: [tried],
    });
    expect(state.holds.get(tried)).toBe('exhausted');
  });

  it('replays only Free plan requests made in the product', () => {
    const request = chatRequest(freeAutoBody());
    expect(freeQuotaFallbackReplay(request, { planTier: 'free', viaApiKey: false })).not.toBeNull();
    expect(freeQuotaFallbackReplay(request, { planTier: 'pro', viaApiKey: false })).toBeNull();
    expect(freeQuotaFallbackReplay(request, { planTier: 'free', viaApiKey: true })).toBeNull();
  });
});
