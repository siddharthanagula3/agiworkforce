// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import {
  FREE_ALLOWANCE_EXHAUSTED_CODE,
  FREE_QUOTA_FALLBACK_REQUEST_KEY,
  FreeLimitSchema,
} from '@agiworkforce/cloud-contracts';
import { getProviderOfferings, getRoutingSlotModel } from '@agiworkforce/types';
import {
  credentialSha256,
  freeQuotaEndsOn,
  readFreeQuotaState,
  recordFreeQuotaHold,
  recordFreeQuotaSuspension,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { loadFreePools, type FreeAutoRoute } from '@/lib/server/free-pools';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';
import { freeQuotaFixtureNow, servableFreeQuotaOfferings } from '@/test/free-quota-fixtures';
type ScanModule0 = typeof import('@/lib/server/key-value');
type ScanModule1 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule2 = typeof import('@/lib/managed-compute-gate');
type ScanModule3 = typeof import('@/lib/services/organization-policy-gate');
type ScanModule4 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule5 = typeof import('@/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration');
type ScanModule6 = typeof import('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate');
type ScanModule7 = typeof import('@/lib/server/free-pools');
type ScanModule8 =
  typeof import('@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence');
type ScanModule9 = typeof import('@/lib/server/free-quota-catalogue-cache');
type ScanModule10 = typeof import('@/lib/moderation');
type ScanModule11 = typeof import('@agiworkforce/model-registry');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore | null,
  query: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  otherProvider: vi.fn(),
  plan: vi.fn(),
  persistUser: vi.fn(),
  hydrate: vi.fn(),
  persistAnswer: vi.fn(),
  moderate: vi.fn(),
  route: undefined as FreeAutoRoute | null | undefined,
  termsReviewExpired: false,
  providerMayTrain: false,
}));

vi.mock('@agiworkforce/model-registry', async (importOriginal) => {
  const actual = await importOriginal<ScanModule11>();
  return {
    ...actual,
    providerKeepsInputsOutOfTraining: (providerId: string) =>
      !mocks.providerMayTrain && actual.providerKeepsInputsOutOfTraining(providerId),
  };
});

vi.mock('@/lib/server/free-quota-catalogue-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  expireFreeQuotaCatalogue: vi.fn(),
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
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence',
  async (importOriginal) => ({
    ...(await importOriginal<ScanModule8>()),
    persistAssistantTurn: mocks.persistAnswer,
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
vi.mock('@/lib/moderation', async (importOriginal) => {
  const actual = await importOriginal<ScanModule10>();
  return {
    ...actual,
    moderateManagedPrompt: (input: Parameters<typeof actual.moderateManagedPrompt>[0]) => {
      mocks.moderate(input);
      return actual.moderateManagedPrompt(input);
    },
  };
});
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule7>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const { freeAutoRoute: shipped, ...inventory } = document.inventory!;
      const route = mocks.route === undefined ? shipped : mocks.route;
      return {
        ...document,
        inventory: {
          ...inventory,
          ...(route ? { freeAutoRoute: route } : {}),
          termsReview: {
            terms: {
              commercialUseAllowed: true,
              thirdPartyServingAllowed: true,
              proxyingAllowed: true,
              promptsExcludedFromTraining: true,
            },
            evidenceUrl: 'https://provider.example/terms',
            reviewedBy: 'fixture-reviewer',
            verifiedAtMs: Date.now() - 86_400_000,
            expiresAtMs: mocks.termsReviewExpired ? Date.now() - 60_000 : Date.now() + 86_400_000,
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

const { freeQuotaFallbackReplay, serveFreeQuotaFallback, serveFreeQuotaFirst } =
  await import('./free-quota-fallback');

const API_KEY = 'fixture-provider-key';
const FREE_AUTO = getRoutingSlotModel('router_zero_cost');
const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';
const ASSISTANT_ID = '62d14f7e-0b3d-40c7-952d-987e841033c5';
const USER_MESSAGE_ID = '72d14f7e-0b3d-40c7-952d-987e841033c5';
const ASSET_ID = 'a2d14f7e-0b3d-40c7-952d-987e841033c5';
const PROHIBITED_PROMPT = 'how do i synthesize sarin at home';
const QUOTA_FIRST: FreeAutoRoute = { order: 'quota_first', quotaFirstByteTimeoutMs: 15_000 };
const inventory = loadFreePools().inventory!;
const NOW = freeQuotaFixtureNow(inventory);
const ranking = inventory.freeAutoFallback?.offeringKeys ?? [];
const readyChat = servableFreeQuotaOfferings(inventory, { apiKey: API_KEY, nowMs: NOW }).filter(
  ({ offering }) => offering.quotaProbeProtocol === 'chat',
);

function endsOn(key: string): string {
  const entry = inventory.entries.find((candidate) => candidate.offeringKey === key)!;
  return freeQuotaEndsOn(entry, getProviderOfferings()[key]!)!;
}

function expectedFirst(candidates: readonly string[]): string {
  const soonest = [...candidates].map(endsOn).sort()[0]!;
  const endingSoonest = candidates.filter((key) => endsOn(key) === soonest);
  return ranking.find((key) => endingSoonest.includes(key)) ?? endingSoonest[0]!;
}

const readyKeys = readyChat.map(({ key }) => key);
const soonestEnd = [...readyKeys].map(endsOn).sort()[0]!;
const FIRST = expectedFirst(readyKeys);

const QUESTION = { role: 'user', content: 'Explain photosynthesis in two sentences.' };

function freeAutoBody(patch: Record<string, unknown> = {}) {
  return {
    model: FREE_AUTO,
    stream: true,
    conversation_id: CONVERSATION_ID,
    assistant_message_id: ASSISTANT_ID,
    user_message: { id: USER_MESSAGE_ID, metadata: {} },
    messages: [QUESTION],
    connector_tools_enabled: false,
    [FREE_QUOTA_FALLBACK_REQUEST_KEY]: true,
    ...patch,
  };
}

function chatRequest(body: unknown, idempotencyKey = 'fixture-turn') {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey, authorization: 'Bearer fixture-token' },
    body: JSON.stringify(body),
  });
}

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function answered(text = 'Answered from the free quota.'): Response {
  return sse(
    JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }] }),
    JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }),
    '[DONE]',
  );
}

const scopedDb = async () => ({
  userId: 'fixture-user',
  organizationId: null,
  db: { query: mocks.query } as never,
});

async function tryFirst(body: unknown = freeAutoBody(), idempotencyKey?: string) {
  const request = chatRequest(body, idempotencyKey);
  const replay = freeQuotaFallbackReplay(request, { planTier: 'free', viaApiKey: false });
  if (!replay) throw new Error('A Free plan request must be replayable');
  const first = await serveFreeQuotaFirst({
    request,
    replay: replay.clone(),
    userId: 'fixture-user',
    scopedDb,
  });
  return { ...first, request, replay };
}

async function attest(quotaOnlyOfferings: 'all' | string[] = 'all', ageMs = 60_000) {
  await writeQuotaAttestation(mocks.store!, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - ageMs,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings,
    attestedBy: 'fixture-operator',
  });
}

async function metered(offeringKey: string): Promise<number> {
  const state = await readFreeQuotaState(mocks.store!, {
    apiKey: API_KEY,
    observedOn: inventory.observedOn,
    offeringKeys: [offeringKey],
  });
  return state.used.get(offeringKey) ?? 0;
}

async function hold(offeringKeys: readonly string[]) {
  for (const offeringKey of offeringKeys) {
    await recordFreeQuotaHold(mocks.store!, {
      apiKey: API_KEY,
      offeringKey,
      cause: 'exhausted',
      nowMs: Date.now(),
    });
  }
}

function expectLaneUntouched() {
  expect(mocks.stream).not.toHaveBeenCalled();
  expect(mocks.moderate).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.persistUser).not.toHaveBeenCalled();
  expect(mocks.persistAnswer).not.toHaveBeenCalled();
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
  mocks.moderate.mockReset();
  mocks.persistUser.mockReset().mockResolvedValue({ id: USER_MESSAGE_ID });
  mocks.persistAnswer.mockReset().mockResolvedValue(undefined);
  mocks.route = QUOTA_FIRST;
  mocks.termsReviewExpired = false;
  mocks.providerMayTrain = false;
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

describe('the shipped Free Auto route', () => {
  it('tries the free quota lane before the free router', () => {
    expect(inventory.freeAutoRoute?.order).toBe('quota_first');
  });

  it('reaches ready chat allocations the fallback ranking leaves out', () => {
    expect(readyKeys.length).toBeGreaterThan(ranking.length);
    expect(ranking.filter((key) => readyKeys.includes(key)).length).toBeGreaterThan(0);
  });
});

describe('a Free Auto turn the free quota lane takes first', () => {
  it('is answered by the ready allocation that ends soonest, with no notice that another model answered', async () => {
    mocks.stream.mockResolvedValue(answered());

    const { response, tried } = await tryFirst();

    expect(response?.status).toBe(200);
    expect(tried).toBe(FIRST);
    expect(endsOn(FIRST)).toBe(soonestEnd);
    expect(response!.headers.get('X-AGI-Resolved-Model')).toBe(FIRST);
    expect(response!.headers.get('X-AGI-Resolved-Provider')).toBe('qwen');
    expect(response!.headers.get('X-AGI-Route-Lane')).toBe('free');
    expect(response!.headers.get('X-AGI-Fallback-Reason')).toBeNull();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0]![0]).toBe(FIRST);
    expect(await response!.text()).toContain('Answered from the free quota.');
    expect(mocks.otherProvider).not.toHaveBeenCalled();
  });

  it('prefers the configured ranking among allocations that end on the same day', async () => {
    const sameDay = readyKeys.filter((key) => endsOn(key) === soonestEnd);
    const rankedSameDay = ranking.filter((key) => sameDay.includes(key));
    expect(rankedSameDay.length).toBeGreaterThan(1);
    mocks.stream.mockImplementation(async () => answered());

    expect(await tryFirst()).toMatchObject({ tried: rankedSameDay[0], response: { status: 200 } });

    await hold([rankedSameDay[0]!]);
    expect(await tryFirst(freeAutoBody(), 'second-turn')).toMatchObject({
      tried: rankedSameDay[1],
      response: { status: 200 },
    });
  });

  it('spends an allocation the ranking leaves out before a ranked one that ends later', async () => {
    const sameDay = readyKeys.filter((key) => endsOn(key) === soonestEnd);
    const unrankedSameDay = sameDay.filter((key) => !ranking.includes(key));
    const rankedLater = ranking.filter(
      (key) => readyKeys.includes(key) && endsOn(key) > soonestEnd,
    );
    expect(unrankedSameDay.length).toBeGreaterThan(0);
    expect(rankedLater.length).toBeGreaterThan(0);
    await hold(sameDay.filter((key) => ranking.includes(key)));
    mocks.stream.mockResolvedValue(answered());

    const { response, tried } = await tryFirst();

    expect(response?.status).toBe(200);
    expect(unrankedSameDay).toContain(tried);
    expect(getProviderOfferings()[tried!]!.quotaThinkingRequired).not.toBe(true);
  });

  it('moves to the allocations that end later once the soonest are spent', async () => {
    await hold(readyKeys.filter((key) => endsOn(key) === soonestEnd));
    const later = readyKeys.filter((key) => endsOn(key) > soonestEnd);
    mocks.stream.mockResolvedValue(answered());

    expect(await tryFirst()).toMatchObject({
      tried: expectedFirst(later),
      response: { status: 200 },
    });
  });

  it('sends an image turn only to an allocation that reads images', async () => {
    mocks.stream.mockResolvedValue(answered());

    const { response, tried } = await tryFirst(
      freeAutoBody({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this photo?' },
              { type: 'file', file: { asset_id: ASSET_ID } },
            ],
          },
        ],
      }),
    );

    expect(response?.status).toBe(200);
    expect(getProviderOfferings()[tried!]!.quotaChatImageInput).toBe(true);
  });

  it('saves the user message once and the answer as a reply nothing was substituted for', async () => {
    mocks.stream.mockResolvedValue(answered());

    const { response } = await tryFirst(freeAutoBody({ assistant_parent_id: USER_MESSAGE_ID }));
    await response!.text();

    expect(mocks.persistUser).toHaveBeenCalledOnce();
    expect(mocks.persistUser.mock.calls[0]![0].message).toMatchObject({
      id: USER_MESSAGE_ID,
      role: 'user',
      content: QUESTION.content,
    });
    expect(mocks.persistAnswer).toHaveBeenCalledOnce();
    const [{ processed, snapshot }] = mocks.persistAnswer.mock.calls[0]!;
    expect(processed).toMatchObject({
      requestId: 'fixture-turn',
      conversationId: CONVERSATION_ID,
      assistantMessageId: ASSISTANT_ID,
      assistantParentId: USER_MESSAGE_ID,
      requestedModel: FREE_AUTO,
      usedFallback: false,
      routeLane: 'free',
    });
    expect(processed.fallbackReason).toBeUndefined();
    expect(snapshot).toEqual({
      content: 'Answered from the free quota.',
      model: FIRST,
      provider: 'qwen',
      inputTokens: 12,
      outputTokens: 3,
      truncated: false,
    });
  });

  it('moderates the turn once and meters it once, settled to what the provider reports', async () => {
    mocks.stream.mockResolvedValue(answered());

    const { response } = await tryFirst();
    await response!.text();

    expect(mocks.moderate).toHaveBeenCalledTimes(1);
    expect(await metered(FIRST)).toBe(15);
  });
});

describe('a Free Auto turn the free quota lane leaves to the free router', () => {
  it.each([
    ['a turn that is not streamed', { stream: false }],
    ['web search', { web_search: true }],
    ['a search the composer asked for', { search_requested: true }],
    [
      'a search the message asks for',
      { messages: [{ role: 'user', content: 'Search the web for the latest news about Mars.' }] },
    ],
    ['code execution', { code_execution: true }],
    ['research', { research: true }],
    ['AGI Work', { work_mode: 'agiwork' }],
    ['a skill', { skill_name: 'fixture-skill' }],
    [
      'client tools',
      { tools: [{ type: 'function', function: { name: 'fixture', parameters: {} } }] },
    ],
    ['a memory command', { memory_command: { kind: 'remember', status: 'saved' } }],
    ['a research resume', { research_resume: { sources: [], steps: [] } }],
    ['a reader with a connector switched on', { connector_tools_enabled: true }],
    ['a reader whose connectors are not known yet', { connector_tools_enabled: undefined }],
    [
      'a conversation whose earlier message carries an attachment the lane would drop',
      {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Summarise this report.' },
              { type: 'file', file: { asset_id: ASSET_ID } },
            ],
          },
          { role: 'assistant', content: 'It covers three quarters.' },
          { role: 'user', content: 'Which quarter was strongest?' },
        ],
      },
    ],
    ['a model the reader picked', { model: readyKeys[0] }],
    [
      'a client that would not say which model answered',
      { [FREE_QUOTA_FALLBACK_REQUEST_KEY]: false },
    ],
  ])('never starts for %s', async (_label, patch) => {
    mocks.stream.mockResolvedValue(answered());

    const { response, tried } = await tryFirst(freeAutoBody(patch));

    expect(response).toBeNull();
    expect(tried).toBeNull();
    expectLaneUntouched();
    expect(await metered(FIRST)).toBe(0);
  });

  it('never starts while the route is configured router first, or not configured', async () => {
    mocks.stream.mockResolvedValue(answered());

    for (const route of [{ ...QUOTA_FIRST, order: 'router_first' as const }, null]) {
      mocks.route = route;
      expect(await tryFirst()).toMatchObject({ response: null, tried: null });
    }

    expectLaneUntouched();
  });

  it('never starts unless its provider is recorded as keeping inputs out of training, since the opt-out is enforced on the free router', async () => {
    mocks.providerMayTrain = true;
    mocks.stream.mockResolvedValue(answered());

    expect(await tryFirst()).toMatchObject({ response: null, tried: null });

    expectLaneUntouched();
    expect(await metered(FIRST)).toBe(0);
  });

  it.each([
    [
      'no console check is recorded',
      async () => {
        mocks.store = createMemoryKeyValueStore();
      },
    ],
    [
      'the console check has run out',
      async () => {
        await attest('all', loadFreeQuotaPolicy().attestationMaxAgeMs);
      },
    ],
    [
      'the console check names no chat allocation',
      async () => {
        await attest(['qwen-quota-unlisted']);
      },
    ],
    [
      'the terms review has lapsed',
      async () => {
        mocks.termsReviewExpired = true;
      },
    ],
    [
      'every allocation has expired',
      async () => {
        vi.setSystemTime(Date.UTC(2030, 0, 1));
        await attest();
      },
    ],
    [
      'the provider reported an account billing state',
      async () => {
        await recordFreeQuotaSuspension(mocks.store!, {
          apiKey: API_KEY,
          signal: 'Arrearage',
          nowMs: Date.now(),
        });
      },
    ],
    [
      'the provider key is missing',
      async () => {
        vi.stubEnv('QWEN_API_KEY', '');
      },
    ],
    [
      'the shared store is missing',
      async () => {
        mocks.store = null;
      },
    ],
  ])('never starts when %s, and reserves nothing', async (_label, arrange) => {
    await arrange();
    mocks.stream.mockResolvedValue(answered());
    const writes = mocks.store ? vi.spyOn(mocks.store, 'increment') : null;

    const { response, tried } = await tryFirst();

    expect(response).toBeNull();
    expect(tried).toBeNull();
    expectLaneUntouched();
    if (writes) expect(writes).not.toHaveBeenCalled();
  });

  it('gives back what it reserved when the provider refuses before answering', async () => {
    mocks.stream.mockResolvedValue(
      Response.json(
        { error: { code: 'Throttling.RateQuota', message: 'Requests rate limit exceeded.' } },
        { status: 429 },
      ),
    );

    const { response, tried } = await tryFirst();

    expect(response).toBeNull();
    expect(tried).toBe(FIRST);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(await metered(FIRST)).toBe(0);
    expect(mocks.persistAnswer).not.toHaveBeenCalled();
  });

  it('holds an allocation the provider reports spent, so the next turn starts on the next one', async () => {
    mocks.stream.mockResolvedValueOnce(
      Response.json({ error: { code: 'AllocationQuota.FreeTierOnly' } }, { status: 403 }),
    );

    expect(await tryFirst()).toMatchObject({ response: null, tried: FIRST });
    expect(await metered(FIRST)).toBe(0);

    mocks.stream.mockResolvedValue(answered());
    const next = await tryFirst(freeAutoBody(), 'second-turn');
    expect(next.response?.status).toBe(200);
    expect(next.tried).toBe(expectedFirst(readyKeys.filter((key) => key !== FIRST)));
  });

  it('withdraws the whole lane at once when the provider reports an account billing state', async () => {
    mocks.stream.mockResolvedValueOnce(
      Response.json({ error: { code: 'Arrearage', message: 'Overdue payment.' } }, { status: 400 }),
    );

    expect(await tryFirst()).toMatchObject({ response: null, tried: FIRST });

    mocks.stream.mockResolvedValue(answered());
    expect(await tryFirst(freeAutoBody(), 'second-turn')).toMatchObject({
      response: null,
      tried: null,
    });
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps its reservation when the provider request fails with no answer, since what was spent is unknown', async () => {
    mocks.stream.mockRejectedValue(new TypeError('fetch failed'));

    const { response, tried } = await tryFirst();

    expect(response).toBeNull();
    expect(tried).toBe(FIRST);
    expect(await metered(FIRST)).toBeGreaterThan(0);
  });

  it('stops waiting when the provider sends nothing within the first-frame limit', async () => {
    mocks.route = { ...QUOTA_FIRST, quotaFirstByteTimeoutMs: 20 };
    mocks.stream.mockImplementation(
      (_key: string, _apiKey: string, _policy: unknown, input: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          input.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const { response, tried } = await tryFirst();

    expect(response).toBeNull();
    expect(tried).toBe(FIRST);
    expect(mocks.stream.mock.calls[0]![3].signal.aborted).toBe(true);
  });

  it('stops waiting when the provider accepts the request and then sends no frame', async () => {
    mocks.route = { ...QUOTA_FIRST, quotaFirstByteTimeoutMs: 20 };
    mocks.stream.mockImplementation(
      async (_key: string, _apiKey: string, _policy: unknown, input: { signal: AbortSignal }) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              input.signal.addEventListener('abort', () => controller.error(new Error('aborted')));
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    );

    const { response, tried } = await tryFirst();

    expect(response).toBeNull();
    expect(tried).toBe(FIRST);
    expect(mocks.persistAnswer).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the first frame is a provider error',
      () =>
        sse(
          JSON.stringify({
            error: {
              code: 'DataInspectionFailed',
              message: 'Input data may contain inappropriate content.',
            },
          }),
        ),
    ],
    ['the stream ends before any text', () => sse('[DONE]')],
    [
      'the connection drops before any frame',
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error('socket hang up'));
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    ],
  ])('hands the turn on when %s, with no reply saved', async (_label, upstream) => {
    mocks.stream.mockResolvedValue(upstream());

    const { response, tried } = await tryFirst();

    expect(response).toBeNull();
    expect(tried).toBe(FIRST);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.persistAnswer).not.toHaveBeenCalled();
  });

  it('leaves the same allocation ready after a failure that was not about its allowance', async () => {
    mocks.stream.mockResolvedValueOnce(sse('[DONE]')).mockResolvedValue(answered());

    expect((await tryFirst()).response).toBeNull();
    const retried = await tryFirst(freeAutoBody(), 'second-turn');

    expect(retried.response?.status).toBe(200);
    expect(retried.tried).toBe(FIRST);
  });
});

describe('a Free Auto turn the free quota lane ends itself', () => {
  it('keeps the answer it started when the provider fails after the first frame, and is not sent again', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [{ index: 0, delta: { content: 'Half an answer' }, finish_reason: null }],
        }),
        JSON.stringify({ error: { code: 'InternalError', message: 'Upstream failed.' } }),
      ),
    );

    const { response, tried } = await tryFirst();

    expect(response?.status).toBe(200);
    expect(tried).toBe(FIRST);
    const text = await response!.text();
    expect(text).toContain('Half an answer');
    expect(text).toContain('x_stream_error');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.persistAnswer.mock.calls[0]![0].snapshot).toMatchObject({
      content: 'Half an answer',
      model: FIRST,
      truncated: true,
    });
  });

  it('returns the platform moderation refusal without asking any provider', async () => {
    const { response, tried } = await tryFirst(
      freeAutoBody({ messages: [{ role: 'user', content: PROHIBITED_PROMPT }] }),
    );

    expect(response?.status).toBe(422);
    expect((await response!.json()).error.code).toBe('content_policy_violation');
    expect(tried).toBe(FIRST);
    expect(mocks.moderate).toHaveBeenCalledTimes(1);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.persistUser).not.toHaveBeenCalled();
    expect(await metered(FIRST)).toBe(0);
  });

  it('answers a turn it already took only once', async () => {
    mocks.stream.mockResolvedValue(answered());
    const taken = await tryFirst();
    await taken.response!.text();
    const meteredOnce = await metered(FIRST);

    mocks.stream.mockResolvedValue(answered('Answered a second time.'));
    const repeated = await tryFirst();

    expect(repeated.response?.status).toBe(409);
    expect((await repeated.response!.json()).error.code).toBe('free_quota_duplicate');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(await metered(FIRST)).toBe(meteredOnce);
  });
});

describe('the free router refusing a turn the free quota lane already tried', () => {
  function refusal(): Response {
    return Response.json(
      {
        error: {
          code: FREE_ALLOWANCE_EXHAUSTED_CODE,
          message: 'Free Auto could not answer.',
          free_limit: { model: FREE_AUTO, reason: 'shared_pool_used' },
        },
      },
      { status: 429 },
    );
  }

  it('offers another ready model without sending the turn to the lane a second time', async () => {
    mocks.stream.mockResolvedValueOnce(
      Response.json(
        { error: { code: 'Throttling.RateQuota', message: 'Requests rate limit exceeded.' } },
        { status: 429 },
      ),
    );
    const first = await tryFirst();
    expect(first.response).toBeNull();
    mocks.stream.mockResolvedValue(answered());

    const declined = await serveFreeQuotaFallback({
      request: first.request,
      replay: first.replay,
      refusal: refusal(),
      userId: 'fixture-user',
      scopedDb,
      tried: first.tried,
    });

    expect(declined?.status).toBe(429);
    expect(declined?.headers.get('X-AGI-Fallback-Reason')).toBeNull();
    const { error } = await declined!.json();
    expect(error.code).toBe(FREE_ALLOWANCE_EXHAUSTED_CODE);
    const offered = FreeLimitSchema.parse(error.free_limit).alternative_model;
    expect(offered).toBeDefined();
    expect(offered).not.toBe(first.tried);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.moderate).toHaveBeenCalledTimes(1);
  });

  it('still answers from the ranking, and says so, when the lane had nothing ready to try first', async () => {
    mocks.store = createMemoryKeyValueStore();
    const first = await tryFirst();
    expect(first).toMatchObject({ response: null, tried: null });
    await attest();
    mocks.stream.mockResolvedValue(answered());

    const served = await serveFreeQuotaFallback({
      request: first.request,
      replay: first.replay,
      refusal: refusal(),
      userId: 'fixture-user',
      scopedDb,
      tried: first.tried,
    });

    expect(served?.status).toBe(200);
    expect(served?.headers.get('X-AGI-Fallback-Reason')).toBe('free_limit_reached');
    expect(ranking).toContain(served?.headers.get('X-AGI-Resolved-Model'));
  });
});
