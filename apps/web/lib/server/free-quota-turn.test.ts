// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { FreeOfferingRequestSchema } from '@agiworkforce/cloud-contracts';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  credentialSha256,
  readFreeQuotaDailyUse,
  readFreeQuotaState,
  reserveFreeQuotaAllowance,
  usableAllowance,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import {
  PROJECT_FILE_CITATIONS_HEADER,
  readProjectSourcesHeaderValue,
} from '@/lib/chat-project-sources';
import { logger } from '@/lib/logger';
import { loadFreePools, type LimitedMediaOffer } from '@/lib/server/free-pools';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';
import type { UserScopedDb } from '@/lib/server/rls-db';
import { freeQuotaFixtureNow, servableFreeQuotaOfferings } from '@/test/free-quota-fixtures';
type ScanModule0 = typeof import('next/server');
type ScanModule1 = typeof import('@/lib/server/key-value');
type ScanModule2 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule3 = typeof import('@/lib/managed-compute-gate');
type ScanModule4 = typeof import('@/lib/services/organization-policy-gate');
type ScanModule5 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule6 = typeof import('@/lib/moderation');
type ScanModule7 = typeof import('@/lib/server/media-storage');
type ScanModule8 = typeof import('@/lib/server/generated-file-persist');
type ScanModule9 = typeof import('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate');
type ScanModule10 = typeof import('@/lib/server/free-pools');
type ScanModule11 = typeof import('@/lib/server/free-quota-catalogue-cache');

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  query: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  otherProvider: vi.fn(),
  plan: vi.fn(),
  download: vi.fn(),
  persist: vi.fn(),
  moderateMedia: vi.fn(),
  expireCatalogue: vi.fn(),
  after: vi.fn(),
  limitedOffer: undefined as LimitedMediaOffer | undefined,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  after: mocks.after,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  resolveEntitledPlanTier: mocks.plan,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildProviderEgressGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  evaluateActiveWorkspacePolicy: vi.fn(async () => ({ allowed: true })),
  resolveZeroDataRetentionPolicy: vi.fn(async () => ({ required: false })),
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
}));
vi.mock('@/lib/moderation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  moderateGeneratedMedia: mocks.moderateMedia,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  bytesFromUrl: mocks.download,
  isGeneratedMediaStorageConfigured: () => true,
}));
vi.mock('@/lib/server/generated-file-persist', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  persistGeneratedFileBytes: mocks.persist,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  applySecretHandlingToTexts: vi.fn(async (_user: string, texts: string[]) => ({
    action: 'clean',
    texts,
  })),
}));
vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<ScanModule10>();
  return {
    ...actual,
    loadFreePools: () => {
      const document = actual.loadFreePools();
      const inventory = document.inventory!;
      return {
        ...document,
        limitedMediaOffer: mocks.limitedOffer,
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
vi.mock('@/lib/server/free-quota-catalogue-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule11>()),
  expireFreeQuotaCatalogue: mocks.expireCatalogue,
}));
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

const { serveFreeQuotaTurn } = await import('./free-quota-turn');

const API_KEY = 'fixture-provider-key';
const USER_ID = 'fixture-user';
const ARTIFACT_URL = 'https://provider.example/generated/artifact';
const MEDIA_ASSET_ID = 'a2d14f7e-0b3d-40c7-952d-987e841033c5';
const OFFER: LimitedMediaOffer = { dailyCapPerUser: { image: 5, video: 5 } };
const OVER_CLIP_WARNING = expect.stringContaining('more seconds than the catalogued clip length');
const inventory = loadFreePools().inventory!;
const NOW = freeQuotaFixtureNow(inventory);
const policy = loadFreeQuotaPolicy();
const servable = servableFreeQuotaOfferings(inventory, { apiKey: API_KEY, nowMs: NOW });
const videos = servable.filter(({ offering }) => offering.quotaProbeProtocol === 'video-async');
const clipLengths = [...new Set(videos.map(({ offering }) => offering.quotaVideoSeconds!))];
const VIDEO_BY_CLIP_LENGTH = clipLengths.map(
  (seconds) =>
    [seconds, videos.find(({ offering }) => offering.quotaVideoSeconds === seconds)!.key] as const,
);
const syncImage = servable.find(
  ({ offering }) => offering.quotaProbeProtocol === 'image-sync',
)!.key;
const polledImage = inventory.entries.find(
  (entry) =>
    entry.quotaOnlyObserved &&
    getProviderOfferings()[entry.offeringKey]!.quotaProbeProtocol === 'image-async',
)!.offeringKey;
const chatModel = servable.find(
  ({ offering }) => offering.quotaProbeProtocol === 'chat' && !offering.quotaThinkingRequired,
)!.key;
const scoped = {
  userId: USER_ID,
  organizationId: null,
  db: { query: mocks.query },
} as unknown as UserScopedDb;

function send(model: string, turn: string) {
  return serveFreeQuotaTurn(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/completions', {
      method: 'POST',
      headers: { 'Idempotency-Key': turn },
    }),
    scoped,
    FreeOfferingRequestSchema.parse({
      model,
      conversation_id: '52d14f7e-0b3d-40c7-952d-987e841033c5',
      assistant_message_id: '62d14f7e-0b3d-40c7-952d-987e841033c5',
      messages: [{ role: 'user', content: 'A paper boat crossing a pond' }],
    }),
  );
}

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function sharedState(key: string) {
  return readFreeQuotaState(mocks.store, {
    apiKey: API_KEY,
    observedOn: inventory.observedOn,
    offeringKeys: [key],
  });
}

async function meterReads(key: string): Promise<number> {
  return (await sharedState(key)).used.get(key)!;
}

function usedToday(category: 'image' | 'video') {
  return readFreeQuotaDailyUse(mocks.store, { userId: USER_ID, category, nowMs: Date.now() });
}

function usableFor(key: string): number {
  return usableAllowance(
    inventory.entries.find((entry) => entry.offeringKey === key)!,
    policy,
  );
}

async function leaveOnMeter(key: string, unitsLeft: number): Promise<void> {
  const usable = usableFor(key);
  await reserveFreeQuotaAllowance(mocks.store, {
    apiKey: API_KEY,
    observedOn: inventory.observedOn,
    offeringKey: key,
    expiresOn: inventory.entries.find((entry) => entry.offeringKey === key)!.expiresOn,
    units: usable - unitsLeft,
    usable,
    nowMs: Date.now(),
  });
}

function generates(mimeType: string, result: Record<string, unknown> = {}) {
  const reserved: { units?: number } = {};
  mocks.media.mockImplementation(async (key: string) => {
    reserved.units = await meterReads(key);
    return { status: 'succeeded', elapsedMs: 1, artifactUrl: ARTIFACT_URL, ...result };
  });
  mocks.download.mockResolvedValue({ data: Buffer.from('generated'), contentType: mimeType });
  return reserved;
}

function refuses(providerCode: string, providerMessage: string) {
  mocks.media.mockResolvedValue({ status: 'failed', elapsedMs: 1, providerCode, providerMessage });
}

async function runAfterResponse(): Promise<void> {
  for (const [task] of mocks.after.mock.calls) await (task as () => unknown)();
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  mocks.store = createMemoryKeyValueStore();
  mocks.query.mockResolvedValue([{ id: 'conversation', data_region: null }]);
  mocks.plan.mockResolvedValue('free');
  mocks.moderateMedia.mockResolvedValue({ allowed: true, contentSha256: 'a'.repeat(64) });
  mocks.persist.mockResolvedValue({
    ok: true,
    version: 1,
    parentFileId: null,
    file: { id: MEDIA_ASSET_ID, uri: `/api/files/${MEDIA_ASSET_ID}` },
  });
  mocks.limitedOffer = OFFER;
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

describe('what a free video takes from its allowance', () => {
  it('has offerings with different clip lengths, none of them the fallback length', () => {
    expect(clipLengths.length).toBeGreaterThan(1);
    expect(clipLengths).not.toContain(policy.videoSeconds);
  });

  it.each(VIDEO_BY_CLIP_LENGTH)(
    'reserves %i seconds before the provider request and settles them, for one request of the daily cap',
    async (clipSeconds, key) => {
      const reserved = generates('video/mp4');

      const response = await send(key, `clip-${clipSeconds}`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`/api/files/${MEDIA_ASSET_ID}`);
      expect(reserved.units).toBe(clipSeconds);
      expect(await meterReads(key)).toBe(clipSeconds);
      expect(await usedToday('video')).toBe(1);
    },
  );

  it.each(VIDEO_BY_CLIP_LENGTH)(
    'settles the seconds the provider reports for a %i second clip, rounded up',
    async (clipSeconds, key) => {
      const warn = vi.spyOn(logger, 'warn');
      generates('video/mp4', { consumedSeconds: clipSeconds - 1.5 });

      expect((await send(key, `reported-${clipSeconds}`)).status).toBe(200);

      expect(await meterReads(key)).toBe(clipSeconds - 1);
      expect(warn).not.toHaveBeenCalledWith(expect.anything(), OVER_CLIP_WARNING);
    },
  );

  it.each(VIDEO_BY_CLIP_LENGTH)(
    'settles more than the %i second clip when the provider reports more, and warns',
    async (clipSeconds, key) => {
      const warn = vi.spyOn(logger, 'warn');
      const consumedSeconds = clipSeconds + 0.2;
      generates('video/mp4', { consumedSeconds, clipSecondsExceeded: true });

      expect((await send(key, `over-${clipSeconds}`)).status).toBe(200);

      expect(await meterReads(key)).toBe(clipSeconds + 1);
      expect(warn).toHaveBeenCalledWith(
        { offering: key, consumedSeconds, clipSeconds },
        OVER_CLIP_WARNING,
      );
    },
  );

  it('keeps the reported seconds on the meter when the finished video cannot be stored', async () => {
    const [clipSeconds, key] = VIDEO_BY_CLIP_LENGTH[0]!;
    generates('video/mp4', { consumedSeconds: clipSeconds + 2 });
    mocks.persist.mockResolvedValue({ ok: false, reason: 'storage_error' });

    expect((await send(key, 'unstored-video')).status).toBe(502);

    expect(await meterReads(key)).toBe(clipSeconds + 2);
  });

  it.each(VIDEO_BY_CLIP_LENGTH)(
    'refuses a %i second offering with less than one clip left, before any provider request',
    async (clipSeconds, key) => {
      const secondsLeft = clipSeconds - 1;
      expect(secondsLeft).toBeGreaterThanOrEqual(policy.videoSeconds);
      await leaveOnMeter(key, secondsLeft);

      const response = await send(key, `short-${clipSeconds}`);

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('free_quota_exhausted');
      expect(mocks.media).not.toHaveBeenCalled();
      expect(await meterReads(key)).toBe(usableFor(key) - secondsLeft);
      expect(await usedToday('video')).toBe(0);
    },
  );

  it.each(VIDEO_BY_CLIP_LENGTH)(
    'serves a %i second offering with exactly one clip left',
    async (clipSeconds, key) => {
      await leaveOnMeter(key, clipSeconds);
      generates('video/mp4');

      expect((await send(key, `last-${clipSeconds}`)).status).toBe(200);

      expect(mocks.media).toHaveBeenCalledOnce();
      expect(await meterReads(key)).toBe(usableFor(key));
    },
  );
});

describe('what a free image takes from its allowance', () => {
  it.each([
    ['answered at once', syncImage],
    ['made through a polled task', polledImage],
  ])('counts an image %s as one image and one request', async (_label, key) => {
    const reserved = generates('image/png');

    const response = await send(key, `image-${key}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`![Generated image](</api/files/${MEDIA_ASSET_ID}>)`);
    expect(mocks.media).toHaveBeenCalledOnce();
    expect(mocks.media.mock.calls[0]![0]).toBe(key);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(reserved.units).toBe(1);
    expect(await meterReads(key)).toBe(1);
    expect(await usedToday('image')).toBe(1);
  });

  it('serves the last image of a polled offering and refuses the next before any provider request', async () => {
    await leaveOnMeter(polledImage, 1);
    generates('image/png');

    expect((await send(polledImage, 'last-polled-image')).status).toBe(200);
    const refused = await send(polledImage, 'no-polled-image-left');

    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe('free_quota_exhausted');
    expect(mocks.media).toHaveBeenCalledOnce();
    expect(await meterReads(polledImage)).toBe(usableFor(polledImage));
  });

  it('never settles an image allowance in seconds', async () => {
    generates('image/png', { consumedSeconds: 4 });

    expect((await send(polledImage, 'image-with-seconds')).status).toBe(200);

    expect(await meterReads(polledImage)).toBe(1);
  });
});

describe('a provider answer that only words a spent allowance or an unpaid bill', () => {
  it.each([
    [
      'a 429 with the spent allocation sentence and no code',
      429,
      { error: { message: 'Free allocated quota exceeded.' } },
      429,
      'provider_rate_limited',
    ],
    [
      'a 429 under a code that is not documented',
      429,
      {
        error: {
          code: 'SomethingNew',
          message: 'Allocated quota exceeded, please increase your quota limit.',
        },
      },
      429,
      'provider_rate_limited',
    ],
    [
      'a 429 with the unfunded account sentence and no code',
      429,
      {
        error: {
          message: 'You exceeded your current quota, please check your plan and billing details.',
        },
      },
      429,
      'provider_rate_limited',
    ],
    [
      'a rejected prompt that quotes a billing sentence',
      400,
      {
        error: {
          code: 'InvalidParameter',
          message: 'Input text cannot be used: payment required',
        },
      },
      502,
      'provider_unreachable',
    ],
  ])(
    'holds no model on %s before a chat reply starts',
    async (_label, status, body, refusedStatus, refusedCode) => {
      mocks.stream.mockResolvedValue(Response.json(body, { status }));

      const response = await send(chatModel, 'worded-refusal');

      expect(response.status).toBe(refusedStatus);
      expect((await response.json()).error.code).toBe(refusedCode);
      expect((await sharedState(chatModel)).holds.has(chatModel)).toBe(false);
      expect(mocks.expireCatalogue).not.toHaveBeenCalled();
      expect(await meterReads(chatModel)).toBe(0);
    },
  );

  it('holds no model when an error inside a streaming reply only words an unpaid bill', async () => {
    mocks.stream.mockResolvedValue(
      sse(JSON.stringify({ error: { message: 'Payment required' } }), '[DONE]'),
    );

    await (await send(chatModel, 'worded-mid-stream')).text();
    await runAfterResponse();

    expect((await sharedState(chatModel)).holds.has(chatModel)).toBe(false);
    expect(mocks.expireCatalogue).not.toHaveBeenCalled();
  });

  it('holds no image model when a failed generation only words an unpaid bill', async () => {
    refuses('InvalidParameter', 'Input text cannot be used: payment required');

    const response = await send(syncImage, 'worded-image');

    expect(response.status).toBe(502);
    expect((await sharedState(syncImage)).holds.has(syncImage)).toBe(false);
    expect(mocks.expireCatalogue).not.toHaveBeenCalled();
  });

  it('holds an image model for billing when the provider answers payment required with no code', async () => {
    mocks.media.mockResolvedValue({
      status: 'failed',
      elapsedMs: 1,
      providerCode: 'provider_http_402',
      providerStatus: 402,
    });

    await send(syncImage, 'unpaid-image');

    expect((await sharedState(syncImage)).holds.get(syncImage)).toBe('billing');
    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
  });
});

describe('the cached catalogue the picker reads, after a provider answer', () => {
  it('is expired once the hold on a spent offering is recorded', async () => {
    const hold = vi.spyOn(mocks.store, 'hashSet');
    refuses('Throttling.AllocationQuota', 'Free allocated quota exceeded.');

    const response = await send(syncImage, 'spent-image');

    expect(response.status).toBe(409);
    expect((await sharedState(syncImage)).holds.get(syncImage)).toBe('exhausted');
    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
    expect(hold.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.expireCatalogue.mock.invocationCallOrder[0]!,
    );
  });

  it('is expired once an account billing state is recorded', async () => {
    const suspension = vi.spyOn(mocks.store, 'set');
    refuses('Arrearage', 'Access denied, please make sure your account is in good standing.');

    const response = await send(syncImage, 'billing-image');

    expect(response.status).toBe(503);
    expect((await sharedState(syncImage)).suspendedAtMs).not.toBeNull();
    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
    expect(suspension.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.expireCatalogue.mock.invocationCallOrder[0]!,
    );
  });

  it('is left to age when the provider fails one request only, or serves it', async () => {
    refuses('InternalError', 'Internal error.');
    expect((await send(syncImage, 'failed-image')).status).toBe(502);
    generates('image/png');
    expect((await send(syncImage, 'served-image')).status).toBe(200);

    expect(mocks.expireCatalogue).not.toHaveBeenCalled();
  });

  it('gives the reservation back and keeps the hold when the expiry itself fails', async () => {
    mocks.expireCatalogue.mockImplementation(() => {
      throw new Error('no request scope');
    });
    refuses('Throttling.AllocationQuota', 'Free allocated quota exceeded.');

    const response = await send(syncImage, 'spent-image-unexpired');

    expect(response.status).toBe(409);
    expect((await sharedState(syncImage)).holds.get(syncImage)).toBe('exhausted');
    expect(await meterReads(syncImage)).toBe(0);
  });

  it('is expired at once when a chat request is refused before the reply starts', async () => {
    mocks.stream.mockResolvedValue(
      Response.json(
        {
          error: { code: 'Throttling.AllocationQuota', message: 'Free allocated quota exceeded.' },
        },
        { status: 429 },
      ),
    );

    const response = await send(chatModel, 'spent-chat');

    expect(response.status).toBe(409);
    expect((await sharedState(chatModel)).holds.get(chatModel)).toBe('exhausted');
    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('is expired after the response closes when the hold arrives inside a streaming reply', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Par' }, finish_reason: null }] }),
        JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' },
        }),
        '[DONE]',
      ),
    );

    const response = await send(chatModel, 'spent-mid-stream');
    await response.text();

    expect((await sharedState(chatModel)).holds.get(chatModel)).toBe('exhausted');
    expect(mocks.expireCatalogue).not.toHaveBeenCalled();
    await runAfterResponse();
    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
  });

  it('is expired when the reader leaves and the response closes before the hold is recorded', async () => {
    const refusal = new TextEncoder().encode(
      `data: ${JSON.stringify({
        error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' },
      })}\n\n`,
    );
    mocks.stream.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => controller.enqueue(refusal),
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const response = await send(chatModel, 'left-mid-stream');
    const reader = response.body!.getReader();
    await reader.read();
    const afterResponse = runAfterResponse();
    expect((await sharedState(chatModel)).holds.has(chatModel)).toBe(false);
    await reader.cancel();
    await afterResponse;

    expect((await sharedState(chatModel)).holds.get(chatModel)).toBe('exhausted');
    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
  });

  it('is left to age after a streamed reply that held no model', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }] }),
        '[DONE]',
      ),
    );

    await (await send(chatModel, 'served-chat')).text();
    await runAfterResponse();

    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.expireCatalogue).not.toHaveBeenCalled();
  });

  it('is expired from inside the stream when nothing can be scheduled after the response', async () => {
    mocks.after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' },
        }),
        '[DONE]',
      ),
    );

    await (await send(chatModel, 'spent-without-scope')).text();

    expect(mocks.expireCatalogue).toHaveBeenCalledOnce();
  });
});

describe('a chat inside a project on a free model', () => {
  const PROJECT_ID = '1f6c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';
  const FILE_ID = '2f6c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';
  const SIBLING_ID = '3f6c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';

  function inProject(project: () => unknown[] = () => []) {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from web_conversations c left join organizations')) {
        return [
          { id: 'conversation', data_region: null, project_id: PROJECT_ID, is_temporary: false },
        ];
      }
      if (sql.includes('from user_projects') && sql.includes('is_archived = false'))
        return project();
      if (sql.includes('from project_knowledge_files')) {
        return [
          {
            id: FILE_ID,
            file_name: 'pricing.md',
            summary: 'Tier table',
            extracted_text: 'Pro costs $20 per month.',
            extracted_anchors: null,
          },
        ];
      }
      if (sql.includes('sibling_candidates')) {
        return [
          {
            id: SIBLING_ID,
            title: 'Pricing chat',
            updated_at: '2026-10-01T12:00:00.000Z',
            role: 'user',
            content: 'Should Pro stay at twenty dollars?',
            created_at: '2026-10-01T11:59:00.000Z',
          },
        ];
      }
      return [];
    });
  }

  const LAUNCH_PLAN = () => [
    {
      id: PROJECT_ID,
      name: 'Launch plan',
      description: null,
      instructions: 'Answer in Spanish.',
      organization_id: null,
    },
  ];

  function sendInProject(turn: string, request: Record<string, unknown> = {}) {
    return serveFreeQuotaTurn(
      new NextRequest('https://agiworkforce.com/api/models/free-quota/completions', {
        method: 'POST',
        headers: { 'Idempotency-Key': turn },
      }),
      scoped,
      FreeOfferingRequestSchema.parse({
        model: chatModel,
        conversation_id: '52d14f7e-0b3d-40c7-952d-987e841033c5',
        assistant_message_id: '62d14f7e-0b3d-40c7-952d-987e841033c5',
        messages: [{ role: 'user', content: 'What does Pro cost?' }],
        ...request,
      }),
    );
  }

  function systemMessages(): string[] {
    const [, , , turn] = mocks.stream.mock.calls[0] as [
      string,
      string,
      unknown,
      { messages: Array<{ role: string; content: unknown }> },
    ];
    return turn.messages
      .filter((message) => message.role === 'system')
      .map((message) => String(message.content));
  }

  beforeEach(() => {
    mocks.stream.mockReset();
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [{ index: 0, delta: { content: 'Veinte' }, finish_reason: null }],
        }),
        '[DONE]',
      ),
    );
  });

  it('sends the project instructions, knowledge and other chats, and names the files it used', async () => {
    inProject(LAUNCH_PLAN);

    const response = await sendInProject('project-chat');
    await response.text();

    expect(response.status).toBe(200);
    const system = systemMessages().join('\n');
    expect(system).toContain('Answer in Spanish.');
    expect(system).toContain('Pro costs $20 per month.');
    expect(system).toContain('Should Pro stay at twenty dollars?');
    expect(
      readProjectSourcesHeaderValue(response.headers.get(PROJECT_FILE_CITATIONS_HEADER)),
    ).toEqual([expect.objectContaining({ fileName: 'pricing.md', projectId: PROJECT_ID })]);
  });

  it('keeps the project instructions when personalization is off', async () => {
    inProject(LAUNCH_PLAN);

    await (await sendInProject('project-chat-unpersonalized', { personalization: false })).text();

    expect(systemMessages().join('\n')).toContain('Answer in Spanish.');
  });

  it('refuses before any model request when the project is archived or gone', async () => {
    inProject(() => []);

    const response = await sendInProject('archived-project');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('project_context_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('refuses before any model request when the project cannot be read', async () => {
    inProject(() => {
      throw new Error('connection reset');
    });

    const response = await sendInProject('unreadable-project');

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('project_context_load_failed');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});
