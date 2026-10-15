// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import {
  FREE_QUOTA_CHAT_DAILY_USE_KIND,
  FreeLimitSchema,
  FreeOfferingRequestSchema,
} from '@agiworkforce/cloud-contracts';
import { composeFreeModelProviderNotice } from '@agiworkforce/compliance';
import { getModelMetadataById } from '@agiworkforce/types';
import {
  PAST_CHAT_CITATIONS_HEADER,
  readPastChatSourcesHeaderValue,
} from '@/lib/chat-project-sources';
import { SECRET_REDACTION_COUNT_HEADER } from '@/lib/chat-secret-redaction-notice';
import {
  credentialSha256,
  readFreeQuotaDailyUse,
  readFreeQuotaState,
  reserveFreeQuotaDailyUse,
  usableAllowance,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';
import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { freeModelProviderNotice } from '@/lib/named-provider-consent';
import { loadFreePools } from '@/lib/server/free-pools';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';
import type { UserScopedDb } from '@/lib/server/rls-db';
import {
  acceptedProviderConsent,
  freeQuotaFixtureNow,
  servableFreeQuotaOfferings,
} from '@/test/free-quota-fixtures';
type ScanModule0 = typeof import('@/lib/server/key-value');
type ScanModule1 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule2 = typeof import('@/lib/managed-compute-gate');
type ScanModule3 = typeof import('@/lib/services/organization-policy-gate');
type ScanModule4 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule6 = typeof import('@/lib/server/free-pools');
type ScanModule7 = typeof import('@/lib/server/free-quota-catalogue-cache');
type ScanModule8 = typeof import('@/lib/services/turn-context-service');
type ScanModule9 = typeof import('@/lib/server/media-storage');
type ScanModule10 = typeof import('@/lib/named-provider-consent');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  query: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  otherProvider: vi.fn(),
  plan: vi.fn(),
  consent: vi.fn(),
  personal: vi.fn(),
  secrets: vi.fn(),
  share: 'configured' as 'configured' | { tokensPerUser: number } | undefined,
  noticeWithheld: false,
}));

vi.mock('@/lib/named-provider-consent', async (importOriginal) => {
  const actual = await importOriginal<ScanModule10>();
  return {
    ...actual,
    freeModelProviderNotice: (provider: string | null | undefined) =>
      mocks.noticeWithheld ? null : actual.freeModelProviderNotice(provider),
  };
});

vi.mock('@/lib/server/named-provider-consent', () => ({
  loadNamedProviderConsent: mocks.consent,
}));
vi.mock('@/lib/services/turn-context-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  resolveFreeOfferingPersonalContext: mocks.personal,
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
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-turn-gate', () => ({
  applySecretHandlingToTurnTexts: mocks.secrets,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  isGeneratedMediaStorageConfigured: () => true,
}));
vi.mock('@/lib/server/free-quota-catalogue-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  expireFreeQuotaCatalogue: vi.fn(),
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const inventory = document.inventory!;
      return {
        ...document,
        freeChatDailyShare:
          mocks.share === 'configured' ? document.freeChatDailyShare : mocks.share,
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

const { readFreeQuotaMemoryCommand, readFreeQuotaPastChatLinks, serveFreeQuotaTurn } =
  await import('./free-quota-turn');

const API_KEY = 'fixture-provider-key';
const USER_ID = 'fixture-user';
const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';
const PROJECT_ID = '92d14f7e-0b3d-40c7-952d-987e841033c5';
const QUESTION = 'Which planet has the most moons?';
const inventory = loadFreePools().inventory!;
const NOW = freeQuotaFixtureNow(inventory);
const policy = loadFreeQuotaPolicy();
const servable = servableFreeQuotaOfferings(inventory, { apiKey: API_KEY, nowMs: NOW });
const chatModels = servable
  .filter(
    ({ offering }) => offering.quotaProbeProtocol === 'chat' && !offering.quotaThinkingRequired,
  )
  .map(({ key }) => key);
const [chatModel, otherChatModel] = chatModels as [string, string];
const imageModel = servable.find(
  ({ offering }) => offering.quotaProbeProtocol === 'image-sync',
)!.key;
const videoModel = servable.find(
  ({ offering }) => offering.quotaProbeProtocol === 'video-async',
)!.key;
const CONFIGURED_TOKENS = loadFreePools().freeChatDailyShare!.tokensPerUser;
const PARALLEL_HEADROOM_UNITS = 20_000;
const sections = chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION);
const scoped = {
  userId: USER_ID,
  organizationId: null,
  db: { query: mocks.query },
} as unknown as UserScopedDb;

interface Fixture {
  projectId: string | null;
  project: Array<Record<string, unknown>> | Error;
}

const fixture: Fixture = { projectId: null, project: [] };

function send(patch: Record<string, unknown> = {}, turn = 'fixture-turn') {
  return serveFreeQuotaTurn(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/completions', {
      method: 'POST',
      headers: { 'Idempotency-Key': turn },
    }),
    scoped,
    {
      ...FreeOfferingRequestSchema.parse({
        model: chatModel,
        conversation_id: CONVERSATION_ID,
        assistant_message_id: '62d14f7e-0b3d-40c7-952d-987e841033c5',
        messages: [{ role: 'user', content: QUESTION }],
        ...patch,
      }),
      ...readFreeQuotaMemoryCommand(patch),
      ...readFreeQuotaPastChatLinks(patch),
    },
  );
}

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function text(content: string): string {
  return JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] });
}

function usage(totalTokens: number): string {
  return JSON.stringify({
    choices: [],
    usage: { prompt_tokens: totalTokens - 1, completion_tokens: 1, total_tokens: totalTokens },
  });
}

function answers(totalTokens: number) {
  return sse(text('Saturn.'), usage(totalTokens), '[DONE]');
}

function chatShareUsed(userId = USER_ID) {
  return readFreeQuotaDailyUse(mocks.store, {
    userId,
    category: FREE_QUOTA_CHAT_DAILY_USE_KIND,
    nowMs: Date.now(),
  });
}

async function poolUsed(key = chatModel): Promise<number> {
  const state = await readFreeQuotaState(mocks.store, {
    apiKey: API_KEY,
    observedOn: inventory.observedOn,
    offeringKeys: [key],
  });
  return state.used.get(key)!;
}

async function useShare(units: number, cap = CONFIGURED_TOKENS) {
  await reserveFreeQuotaDailyUse(mocks.store, {
    userId: USER_ID,
    category: FREE_QUOTA_CHAT_DAILY_USE_KIND,
    cap,
    units,
    nowMs: Date.now(),
  });
}

function recordsReservation() {
  const reserved: { share?: number; pool?: number; replyTokens?: number } = {};
  mocks.stream.mockImplementation(async (_key, _apiKey, turnPolicy) => {
    reserved.share = await chatShareUsed();
    reserved.pool = await poolUsed();
    reserved.replyTokens = turnPolicy.maxOutputTokens;
    return answers(1_200);
  });
  return reserved;
}

function sentMessages(call = 0) {
  return mocks.stream.mock.calls[call]![3].messages as { role: string; content: string }[];
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.share = 'configured';
  mocks.noticeWithheld = false;
  fixture.projectId = null;
  fixture.project = [];
  mocks.stream.mockReset();
  mocks.media.mockReset();
  mocks.otherProvider.mockReset();
  mocks.plan.mockReset().mockResolvedValue('free');
  mocks.query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('from user_projects')) {
      if (fixture.project instanceof Error) throw fixture.project;
      return fixture.project;
    }
    if (sql.includes('from web_conversations c')) {
      return [
        {
          id: CONVERSATION_ID,
          data_region: null,
          project_id: fixture.projectId,
          is_temporary: false,
        },
      ];
    }
    return [];
  });
  mocks.consent
    .mockReset()
    .mockImplementation(async (_db, _userId, providerId) =>
      acceptedProviderConsent(providerId, Date.now()),
    );
  mocks.personal.mockReset().mockResolvedValue({
    status: 'ready',
    blocks: [],
    projectBlocks: [],
    projectCitations: [],
    memoryCitations: [],
    pastChatSources: [],
  });
  mocks.secrets
    .mockReset()
    .mockImplementation(async (_userId: string, _request: unknown, texts: string[]) => ({
      action: 'clean',
      texts,
      matchCount: 0,
    }));
  await writeQuotaAttestation(mocks.store, {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: Date.now() - 60_000,
    credentialSha256: credentialSha256(API_KEY),
    quotaOnlyOfferings: 'all',
    attestedBy: 'fixture-operator',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("each account's daily share of free chat", () => {
  it('is a small part of one model allowance, never the whole of it', () => {
    const smallestPool = Math.min(
      ...chatModels.map((key) =>
        usableAllowance(
          inventory.entries.find((entry) => entry.offeringKey === key)!,
          policy,
        ),
      ),
    );

    expect(CONFIGURED_TOKENS).toBe(120_000);
    expect(CONFIGURED_TOKENS / smallestPool).toBeLessThanOrEqual(0.15);
  });

  it('reserves what the pool reserves before the provider is asked, and settles both to the reported total', async () => {
    const reserved = recordsReservation();

    const response = await send();
    await response.text();

    expect(response.status).toBe(200);
    expect(reserved.share).toBeGreaterThan(policy.chatMaxOutputTokens);
    expect(reserved.share).toBe(reserved.pool);
    expect(await chatShareUsed()).toBe(1_200);
    expect(await poolUsed()).toBe(1_200);
  });

  it('counts every free chat model against the same share and keeps accounts apart', async () => {
    mocks.stream.mockImplementation(async () => answers(1_000));

    await (await send({}, 'first-model')).text();
    await (await send({ model: otherChatModel }, 'second-model')).text();

    expect(await chatShareUsed()).toBe(2_000);
    expect(await chatShareUsed('another-user')).toBe(0);
  });

  it('gives the share back when the provider refuses the request, as the model allowance does', async () => {
    mocks.stream.mockResolvedValue(
      Response.json({ error: { code: 'Throttling.RateQuota' } }, { status: 429 }),
    );

    const response = await send();

    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('provider_rate_limited');
    expect(await chatShareUsed()).toBe(0);
    expect(await poolUsed()).toBe(0);
  });

  it.each([
    [
      'the provider cannot be reached',
      async () => {
        mocks.stream.mockRejectedValue(new Error('socket closed'));
        expect((await send()).status).toBe(502);
      },
    ],
    [
      'the reply ends before any of it arrived',
      async () => {
        mocks.stream.mockResolvedValue(sse());
        await (await send()).text();
      },
    ],
    [
      'the reader stops before any output',
      async () => {
        mocks.stream.mockResolvedValue(
          new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
        await (await send()).body!.cancel();
      },
    ],
    [
      'a reply that had started is cut off with no usage report',
      async () => {
        mocks.stream.mockResolvedValue(sse(text('Saturn has')));
        await (await send()).text();
      },
    ],
  ])(
    'keeps the share reserved when %s, because the model allowance keeps its reservation too',
    async (_ending, run) => {
      await run();

      const held = await poolUsed();
      expect(held).toBeGreaterThan(policy.chatMaxOutputTokens);
      expect(await chatShareUsed()).toBe(held);
    },
  );

  it('settles the share and the model allowance to the reported total when the reader stops after it', async () => {
    const encoder = new TextEncoder();
    mocks.stream.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${text('Saturn has')}\n\ndata: ${usage(1_100)}\n\n`),
            );
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const response = await send();
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    expect(await chatShareUsed()).toBe(1_100);
    expect(await poolUsed()).toBe(1_100);
  });

  it('does not let failed or stopped turns from one account take more of a model than its share', async () => {
    mocks.stream.mockRejectedValue(new Error('socket closed'));
    const statuses: number[] = [];
    for (let turn = 0; turn < 50 && statuses.at(-1) !== 429; turn += 1) {
      statuses.push((await send({}, `failed-${turn}`)).status);
    }

    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((status) => status === 502)).toBe(true);
    expect(statuses.length).toBeGreaterThan(2);
    expect(await poolUsed()).toBeLessThanOrEqual(CONFIGURED_TOKENS);
    expect(await poolUsed()).toBe(await chatShareUsed());
  });

  it('keeps turns sent at the same moment inside the share', async () => {
    const alreadyUsed = Math.max(0, CONFIGURED_TOKENS - PARALLEL_HEADROOM_UNITS);
    await useShare(alreadyUsed);
    let highest = 0;
    mocks.stream.mockImplementation(async () => {
      highest = Math.max(highest, await chatShareUsed());
      return answers(1_000);
    });

    const responses = await Promise.all(
      Array.from({ length: 12 }, (_unused, turn) => send({}, `parallel-${turn}`)),
    );
    await Promise.all(responses.map((response) => response.text()));

    const served = responses.filter((response) => response.status === 200).length;
    expect(served).toBeGreaterThan(0);
    expect(served).toBeLessThan(responses.length);
    expect(responses.every((response) => [200, 429].includes(response.status))).toBe(true);
    expect(highest).toBeLessThanOrEqual(CONFIGURED_TOKENS);
    expect(await chatShareUsed()).toBe(alreadyUsed + served * 1_000);
  });

  it('refuses at the limit before any provider request, in words that are true for chat, and offers Free Auto', async () => {
    await useShare(CONFIGURED_TOKENS);

    const response = await send();

    expect(response.status).toBe(429);
    const { error } = await response.json();
    expect(error.code).toBe('free_quota_daily_limit');
    expect(error.message).toContain("Today's free chat share does not have enough left");
    expect(error.message).toContain('120,000 tokens a day');
    expect(error.message).toContain('every free chat model');
    expect(error.message).toContain('resets at 00:00 UTC');
    expect(error.message).toContain(getModelMetadataById(FREE_TRIAL_MODEL)!.name);
    expect(error.message).not.toMatch(/image|video|Plans that include|You have used/);
    expect(FreeLimitSchema.parse(error.free_limit)).toEqual({
      model: chatModel,
      reason: 'daily_limit_reached',
      resets_at: new Date(Date.UTC(2026, 9, 5)).toISOString(),
      alternative_model: FREE_TRIAL_MODEL,
    });
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(await chatShareUsed()).toBe(CONFIGURED_TOKENS);
  });

  it('holds another free chat model to the share the first one used up', async () => {
    await useShare(CONFIGURED_TOKENS);

    const response = await send({ model: otherChatModel });

    expect(response.status).toBe(429);
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('starts again on the next UTC day', async () => {
    await useShare(CONFIGURED_TOKENS);
    vi.setSystemTime(Date.UTC(2026, 9, 5, 0, 0, 1));
    mocks.stream.mockImplementation(async () => answers(900));

    const response = await send();
    await response.text();

    expect(response.status).toBe(200);
    expect(await chatShareUsed()).toBe(900);
  });

  it('shortens the last reply of the day to what is left of the share instead of refusing it', async () => {
    const whole = recordsReservation();
    await (await send({}, 'measure')).text();
    const inputUnits = whole.share! - policy.chatMaxOutputTokens;
    mocks.store = createMemoryKeyValueStore();
    await writeQuotaAttestation(mocks.store, {
      sourceUrl: 'https://home.qwencloud.com/benefits',
      checkedAtMs: Date.now() - 60_000,
      credentialSha256: credentialSha256(API_KEY),
      quotaOnlyOfferings: 'all',
      attestedBy: 'fixture-operator',
    });
    const left = inputUnits + 700;
    await useShare(CONFIGURED_TOKENS - left);
    const last = recordsReservation();

    const response = await send({}, 'last-of-the-day');
    await response.text();

    expect(response.status).toBe(200);
    expect(last.replyTokens).toBe(700);
    expect(last.share).toBe(CONFIGURED_TOKENS);
  });

  it('says what is left today cannot fit the turn, without claiming the whole share was used, when part of it is unspent', async () => {
    await useShare(CONFIGURED_TOKENS - policy.minimumChatQuota);

    const response = await send();

    expect(response.status).toBe(429);
    const { error } = await response.json();
    expect(error.code).toBe('free_quota_daily_limit');
    expect(error.message).toContain('does not have enough left for this message');
    expect(error.message).not.toMatch(/You have used/);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(await chatShareUsed()).toBeLessThan(CONFIGURED_TOKENS);
  });

  it('answers too long, not the daily limit, when the input alone is more than a whole day', async () => {
    mocks.share = { tokensPerUser: policy.minimumChatQuota };

    const response = await send();

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe('context_length_exceeded');
    expect(error.message).toContain('larger than the free chat share');
    expect(error.message).toContain(
      `${policy.minimumChatQuota.toLocaleString('en-US')} tokens a day`,
    );
    expect(error.message).toContain(getModelMetadataById(FREE_TRIAL_MODEL)!.name);
    expect(error.message).not.toMatch(/another free model|too long for/);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(await chatShareUsed()).toBe(0);
  });

  it('gives the share back when the model allowance cannot take the turn', async () => {
    const entry = inventory.entries.find((row) => row.offeringKey === chatModel)!;
    const usable = usableAllowance(entry, policy);
    const increment = mocks.store.increment.bind(mocks.store);
    let poolTaken = false;
    vi.spyOn(mocks.store, 'increment').mockImplementation(async (key, amount) => {
      if (key.includes(':used:') && !poolTaken) {
        poolTaken = true;
        await increment(key, usable);
      }
      return increment(key, amount);
    });

    const response = await send();

    expect(poolTaken).toBe(true);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('free_quota_exhausted');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(await chatShareUsed()).toBe(0);
  });

  it('sends nothing when the share cannot be read', async () => {
    const get = mocks.store.get.bind(mocks.store);
    vi.spyOn(mocks.store, 'get').mockImplementation(async (key: string) => {
      if (key.includes(':daily:chat:')) throw new Error('store unreachable');
      return get(key);
    });

    const response = await send();

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('sends nothing when the share cannot be written', async () => {
    const increment = mocks.store.increment.bind(mocks.store);
    vi.spyOn(mocks.store, 'increment').mockImplementation(async (key, amount) => {
      if (key.includes(':daily:chat:')) throw new Error('store unreachable');
      return increment(key, amount);
    });

    const response = await send();

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(await poolUsed()).toBe(0);
  });

  it('sends nothing when no share is configured, so removing it cannot open a pool to one account', async () => {
    mocks.share = undefined;

    const response = await send();

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});

describe('the agreement to a named provider', () => {
  const notice = composeFreeModelProviderNotice('qwen');

  it('is read for the provider that runs the model, with the account and its own connection', async () => {
    mocks.stream.mockImplementation(async () => answers(900));

    await (await send()).text();

    expect(mocks.consent).toHaveBeenCalledWith(scoped.db, USER_ID, 'qwen');
  });

  it.each([
    ['never given', null],
    ['withdrawn', { ...acceptedProviderConsent('qwen', NOW), accepted: false }],
    [
      'given for wording that has since changed',
      { ...acceptedProviderConsent('qwen', NOW), disclosureVersion: 'fnv-0000000000000000' },
    ],
    [
      'given for another provider',
      { ...acceptedProviderConsent('qwen', NOW), providerId: 'deepseek' },
    ],
  ])('refuses a chat turn when the agreement was %s', async (_label, consent) => {
    mocks.consent.mockResolvedValue(consent);

    const response = await send();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toEqual({
      code: 'cn_hq_provider_not_opted_in',
      provider_id: 'qwen',
      message: expect.stringContaining(notice.providerName),
    });
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.personal).not.toHaveBeenCalled();
    expect(await chatShareUsed()).toBe(0);
    expect(await poolUsed()).toBe(0);
  });

  it.each([
    ['image', imageModel],
    ['video', videoModel],
  ])(
    'refuses a free %s request without the agreement, so media cannot go round it',
    async (_kind, model) => {
      mocks.plan.mockResolvedValue('max_15x');
      mocks.consent.mockResolvedValue(null);

      const response = await send({ model });

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('cn_hq_provider_not_opted_in');
      expect(mocks.media).not.toHaveBeenCalled();
    },
  );

  it('takes a withdrawal into account on the very next turn', async () => {
    mocks.stream.mockImplementation(async () => answers(900));
    await (await send({}, 'while-agreed')).text();
    mocks.consent.mockResolvedValue({ ...acceptedProviderConsent('qwen', NOW), accepted: false });

    const response = await send({}, 'after-withdrawal');

    expect(response.status).toBe(403);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('has a notice for every model the inventory can serve, so no model is served unasked', () => {
    expect(servable.length).toBeGreaterThan(0);
    for (const { key, offering } of servable) {
      expect(freeModelProviderNotice(offering.provider), key).not.toBeNull();
    }
  });

  it.each([
    ['chat', chatModel],
    ['image', imageModel],
    ['video', videoModel],
  ])(
    'sends nothing for the %s model when it has no notice a person could have agreed to',
    async (_kind, model) => {
      mocks.plan.mockResolvedValue('max_15x');
      mocks.noticeWithheld = true;
      if (model === chatModel) mocks.plan.mockResolvedValue('free');

      const response = await send({ model });

      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('free_quota_unavailable');
      expect(mocks.consent).not.toHaveBeenCalled();
      expect(mocks.stream).not.toHaveBeenCalled();
      expect(mocks.media).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['image', imageModel],
    ['video', videoModel],
  ])(
    'does not point a refused free %s request at a chat model that cannot make one',
    async (_kind, model) => {
      mocks.plan.mockResolvedValue('max_15x');
      mocks.consent.mockResolvedValue(null);

      const { error } = await (await send({ model })).json();

      expect(error.message).toContain(notice.providerName);
      expect(error.message).not.toContain(getModelMetadataById(FREE_TRIAL_MODEL)!.name);
    },
  );

  it('offers Free Auto in place of the agreement for a chat turn', async () => {
    mocks.consent.mockResolvedValue(null);

    const { error } = await (await send()).json();

    expect(error.message).toContain(`or choose ${getModelMetadataById(FREE_TRIAL_MODEL)!.name}`);
  });

  it('sends nothing when the agreement cannot be read', async () => {
    mocks.consent.mockRejectedValue(new Error('database unreachable'));

    const response = await send();

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});

describe('the project a free chat belongs to', () => {
  const PROJECT = {
    name: 'Orbital survey',
    description: 'Notes for the survey paper.',
    instructions: 'Always answer in British English.',
  };
  const PROJECT_BLOCK = {
    layer: 'project' as const,
    text: `${PROJECT.name}\n${PROJECT.description}\n${PROJECT.instructions}`,
  };
  const PERSONAL_BLOCKS = [
    { layer: 'memory', text: 'SAVED MEMORIES' },
    { layer: 'personalized', text: 'CUSTOM INSTRUCTIONS' },
  ];

  function personalWith(projectBlocks: unknown[]) {
    mocks.personal.mockResolvedValue({
      status: 'ready',
      projectBlocks,
      projectCitations: [],
      blocks: PERSONAL_BLOCKS,
      memoryCitations: [],
      pastChatSources: [],
    });
  }

  beforeEach(() => {
    fixture.projectId = PROJECT_ID;
    mocks.stream.mockImplementation(async () => answers(900));
    personalWith([PROJECT_BLOCK]);
  });

  it('sends its instructions after the product prompt and ahead of the personal blocks, whatever order they arrive in', async () => {
    await (await send()).text();

    const [product, project, ...rest] = sentMessages();
    expect(product!.content).toContain(chatSystemPromptSection(sections, 'identity'));
    expect(project).toEqual({ role: 'system', content: PROJECT_BLOCK.text });
    expect(rest).toEqual([
      { role: 'system', content: 'CUSTOM INSTRUCTIONS' },
      { role: 'system', content: 'SAVED MEMORIES' },
      { role: 'user', content: QUESTION },
    ]);
  });

  it('counts the instructions in what the turn reserves', async () => {
    const withProject = recordsReservation();
    await (await send({}, 'with-project')).text();
    personalWith([]);
    const without = recordsReservation();
    await (await send({}, 'without-project')).text();

    const settledFirstTurn = 1_200;
    expect(withProject.pool!).toBeGreaterThan(without.pool! - settledFirstTurn);
    expect(withProject.share!).toBeGreaterThan(without.share! - settledFirstTurn);
  });

  it('sends no project block when the context holds none', async () => {
    personalWith([]);

    await (await send()).text();

    expect(sentMessages().map((message) => message.content)).not.toContainEqual(
      expect.stringContaining(PROJECT.instructions),
    );
  });

  it('refuses the turn when the project is archived, deleted or not the caller’s', async () => {
    mocks.personal.mockResolvedValue({ status: 'project_unavailable' });

    const response = await send();

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('project_context_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('refuses rather than answering unscoped when the project cannot be read', async () => {
    mocks.personal.mockResolvedValue({ status: 'project_load_failed' });

    const response = await send();

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('project_context_load_failed');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('passes the instructions through the secret gate and sends what the gate returns', async () => {
    mocks.secrets.mockImplementation(
      async (_userId: string, _request: unknown, texts: string[]) => ({
        action: 'redacted',
        texts: texts.map((value) => value.replace(PROJECT.instructions, '[REDACTED]')),
        matchCount: 1,
      }),
    );

    await (await send()).text();

    const gated = mocks.secrets.mock.calls[1]![2] as string[];
    expect(gated.some((text) => text.includes(PROJECT.instructions))).toBe(true);
    expect(JSON.stringify(sentMessages())).not.toContain(PROJECT.instructions);
    expect(sentMessages()[1]!.content).toContain('[REDACTED]');
  });
});

describe('what a free chat turn tells the reader it did', () => {
  beforeEach(() => {
    mocks.stream.mockImplementation(async () => answers(900));
  });

  it('gates the turn with the request, so a detected secret is recorded like any other turn', async () => {
    await (await send()).text();

    const [userId, request, texts] = mocks.secrets.mock.calls[0]!;
    expect(userId).toBe(USER_ID);
    expect(request).toBeInstanceOf(NextRequest);
    expect(texts).toEqual([QUESTION]);
  });

  it('reports how many secrets were removed, and none when nothing was', async () => {
    const clean = await send({}, 'clean');
    await clean.text();
    mocks.secrets.mockImplementationOnce(
      async (_userId: string, _request: unknown, texts: string[]) => ({
        action: 'redacted',
        texts: texts.map(() => 'My key is [REDACTED].'),
        matchCount: 2,
      }),
    );

    const redacted = await send({}, 'redacted');
    await redacted.text();

    expect(clean.headers.get(SECRET_REDACTION_COUNT_HEADER)).toBeNull();
    expect(redacted.headers.get(SECRET_REDACTION_COUNT_HEADER)).toBe('2');
    expect(sentMessages(1).at(-1)).toEqual({ role: 'user', content: 'My key is [REDACTED].' });
  });

  it('sends nothing when the secret setting blocks the turn', async () => {
    mocks.secrets.mockResolvedValue({ action: 'blocked', texts: [QUESTION], matchCount: 1 });

    const response = await send();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('secrets_blocked');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('says the past chats are linked only when the client draws those links (MEM-4)', async () => {
    await (await send({}, 'links-unreported')).text();
    await (await send({ x_past_chat_links: true }, 'links-shown')).text();
    await (await send({ x_past_chat_links: 'yes' }, 'links-unreadable')).text();

    expect(mocks.personal.mock.calls.map(([, input]) => input.pastChatLinksShown)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('names the past chats the reply drew on', async () => {
    const pastChatSources = [
      {
        id: 'past-1',
        conversationId: 'a2d14f7e-0b3d-40c7-952d-987e841033c5',
        messageId: 'b2d14f7e-0b3d-40c7-952d-987e841033c5',
        title: 'Moons of the outer planets',
        createdAt: '2026-09-30T10:00:00.000Z',
      },
    ];
    mocks.personal.mockResolvedValue({
      status: 'ready',
      projectBlocks: [],
      projectCitations: [],
      blocks: [{ layer: 'memory', text: 'PAST CHAT EXCERPTS' }],
      memoryCitations: [],
      pastChatSources,
    });

    const response = await send();
    await response.text();

    expect(
      readPastChatSourcesHeaderValue(response.headers.get(PAST_CHAT_CITATIONS_HEADER)),
    ).toEqual(pastChatSources);
  });

  it('tells the model what a typed remember command already did', async () => {
    const remember = 'Remember that I prefer metric units';

    await (
      await send({
        messages: [{ role: 'user', content: remember }],
        memory_command: { kind: 'remember', status: 'stored' },
      })
    ).text();

    const [product, note, question] = sentMessages();
    expect(product!.content).toContain(chatSystemPromptSection(sections, 'identity'));
    expect(note!.role).toBe('system');
    expect(note!.content).toContain('the app has already handled it');
    expect(note!.content).toContain('It was saved to memory.');
    expect(question).toEqual({ role: 'user', content: remember });
  });

  it('adds no memory note to a turn that reported no command, or one it cannot read', async () => {
    await (await send({}, 'no-command')).text();
    await (
      await send({ memory_command: { kind: 'remember', status: 'made-up' } }, 'unreadable-command')
    ).text();

    expect(JSON.stringify(sentMessages(0))).not.toContain('the app has already handled it');
    expect(JSON.stringify(sentMessages(1))).not.toContain('the app has already handled it');
    expect(readFreeQuotaMemoryCommand(null)).toEqual({});
  });
});
