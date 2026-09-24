// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryKeyValueStore, type MemoryKeyValueStore } from '@agiworkforce/key-value';
import { getProviderOfferings } from '@agiworkforce/types';
import {
  credentialSha256,
  readFreeQuotaState,
  reserveFreeQuotaAllowance,
  sharesManagedRoute,
  writeQuotaAttestation,
} from '@/lib/free-quota-authorization';
import { loadFreePools } from '@/lib/server/free-pools';
import { loadFreeQuotaPolicy } from '@/lib/server/free-quota-catalogue';

const mocks = vi.hoisted(() => ({
  store: null as unknown as MemoryKeyValueStore,
  query: vi.fn(),
  stream: vi.fn(),
  media: vi.fn(),
  otherProvider: vi.fn(),
  egress: vi.fn(),
  privacy: vi.fn(),
  retention: vi.fn(),
  plan: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  fetch: vi.fn(),
  download: vi.fn(),
  persist: vi.fn(),
  persistUser: vi.fn(),
  moderateMedia: vi.fn(),
  hydrate: vi.fn(),
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    userId: 'fixture-user',
    organizationId: null,
    db: { query: mocks.query },
  })),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
  getKeyValueStore: () => mocks.store,
  getKeyValueProvider: () => 'upstash',
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitledPlanTier: mocks.plan,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildProviderEgressGateResponse: mocks.egress,
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-policy-gate')>()),
  evaluateActiveWorkspacePolicy: mocks.privacy,
  resolveZeroDataRetentionPolicy: mocks.retention,
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>()),
  enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
}));
vi.mock('@/lib/moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation')>()),
  moderateGeneratedMedia: mocks.moderateMedia,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/media-storage')>()),
  bytesFromUrl: mocks.download,
  isGeneratedMediaStorageConfigured: () => true,
}));
vi.mock('@/lib/server/generated-file-persist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/generated-file-persist')>()),
  persistGeneratedFileBytes: mocks.persist,
}));
vi.mock(
  '@/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration')
    >()),
    hydrateChatAttachments: mocks.hydrate,
  }),
);
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/persist-message', () => ({
  persistConversationMessage: mocks.persistUser,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate')
  >()),
  applySecretHandlingToTexts: vi.fn(async (_user: string, texts: string[]) => ({
    action: 'clean',
    texts,
  })),
}));
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-trial-service')>()),
  beginFreeTrialRequest: mocks.begin,
  settleFreeTrialRequest: mocks.settle,
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

const { POST } = await import('./route');

const API_KEY = 'fixture-provider-key';
const inventory = loadFreePools().inventory!;
const today = new Date().toISOString().slice(0, 10);
const [model, second] = inventory.entries
  .filter((entry) => {
    const offering = getProviderOfferings()[entry.offeringKey]!;
    return (
      entry.quotaOnlyObserved &&
      entry.providerStatus === 'active' &&
      (entry.expiresOn ?? '9999') > today &&
      offering.quotaProbeProtocol === 'chat' &&
      !offering.quotaThinkingRequired &&
      !sharesManagedRoute(offering)
    );
  })
  .map((entry) => entry.offeringKey);
const modelName = getProviderOfferings()[model!]!.displayName;
const visionModel = inventory.entries.find((entry) => {
  const offering = getProviderOfferings()[entry.offeringKey]!;
  return (
    entry.quotaOnlyObserved &&
    entry.providerStatus === 'active' &&
    (entry.expiresOn ?? '9999') > today &&
    offering.quotaProbeProtocol === 'chat' &&
    offering.quotaChatImageInput === true &&
    !sharesManagedRoute(offering)
  );
})!.offeringKey;
const imageModel = inventory.entries.find((entry) => {
  const offering = getProviderOfferings()[entry.offeringKey]!;
  return (
    entry.quotaOnlyObserved &&
    entry.providerStatus === 'active' &&
    (entry.expiresOn ?? '9999') > today &&
    offering.quotaProbeProtocol === 'image-sync' &&
    !sharesManagedRoute(offering)
  );
})!.offeringKey;
const videoModel = inventory.entries.find((entry) => {
  const offering = getProviderOfferings()[entry.offeringKey]!;
  return (
    entry.quotaOnlyObserved &&
    entry.providerStatus === 'active' &&
    (entry.expiresOn ?? '9999') > today &&
    offering.quotaProbeProtocol === 'video-async' &&
    !sharesManagedRoute(offering)
  );
})!.offeringKey;
const MEDIA_ASSET_ID = 'a2d14f7e-0b3d-40c7-952d-987e841033c5';
const PROVIDER_ARTIFACT_URL = 'https://provider.example/generated/poster.png';

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function post(patch: Record<string, unknown> = {}, idempotencyKey = 'fixture-turn') {
  return POST(
    new NextRequest('https://agiworkforce.com/api/models/free-quota/completions', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        model,
        conversation_id: '52d14f7e-0b3d-40c7-952d-987e841033c5',
        assistant_message_id: '62d14f7e-0b3d-40c7-952d-987e841033c5',
        messages: [{ role: 'user', content: 'Hello' }],
        ...patch,
      }),
    }),
  );
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

async function sharedState() {
  return readFreeQuotaState(mocks.store, {
    apiKey: API_KEY,
    observedOn: inventory.observedOn,
    offeringKeys: [model!, second!],
  });
}

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('QWEN_API_KEY', API_KEY);
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.store = createMemoryKeyValueStore();
  mocks.query.mockResolvedValue([{ id: 'conversation', data_region: null }]);
  mocks.privacy.mockResolvedValue({ allowed: true });
  mocks.retention.mockResolvedValue({ required: false });
  mocks.plan.mockResolvedValue('free');
  mocks.egress.mockResolvedValue(null);
  mocks.download.mockResolvedValue({
    data: Buffer.from('generated-image'),
    contentType: 'image/png',
  });
  mocks.moderateMedia.mockResolvedValue({
    allowed: true,
    contentSha256: 'a'.repeat(64),
  });
  mocks.persist.mockResolvedValue({
    ok: true,
    version: 1,
    parentFileId: null,
    file: {
      id: MEDIA_ASSET_ID,
      file_name: 'free-generated-image.png',
      mime_type: 'image/png',
      uri: `/api/files/${MEDIA_ASSET_ID}`,
      byte_count: 15,
      kind: 'image',
      checksum_sha256: 'a'.repeat(64),
      surface: 'file',
      previewable: true,
    },
  });
  mocks.persistUser.mockReset().mockResolvedValue({ id: 'persisted-user' });
  mocks.hydrate.mockReset().mockImplementation(async (messages) => {
    const latest = messages.at(-1);
    if (latest && Array.isArray(latest.content)) {
      latest.content = latest.content.map((part: { type: string; file?: { asset_id: string } }) =>
        part.type === 'file'
          ? { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
          : part,
      );
      return [{ filename: 'image.png', mimeType: 'image/png', base64: 'aW1hZ2U=' }];
    }
    return [];
  });
  mocks.begin.mockImplementation(async ({ userId, requestId }) => ({
    ok: true,
    reservation: { kind: 'free_trial', userId, requestId, reservedMicrousd: 25_000 },
  }));
  mocks.settle.mockResolvedValue(undefined);
  await attest();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Qwen free quota turns on the Free plan', () => {
  it('persists a threaded user turn before requesting free inference', async () => {
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    const response = await post({
      user_message: {
        id: '72d14f7e-0b3d-40c7-952d-987e841033c5',
        metadata: {},
        parent_id: '82d14f7e-0b3d-40c7-952d-987e841033c5',
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.persistUser).toHaveBeenCalledWith({
      db: expect.anything(),
      scope: {
        conversationId: '52d14f7e-0b3d-40c7-952d-987e841033c5',
        userId: 'fixture-user',
        organizationId: null,
      },
      message: {
        id: '72d14f7e-0b3d-40c7-952d-987e841033c5',
        role: 'user',
        content: 'Hello',
        metadata: {},
        parentId: '82d14f7e-0b3d-40c7-952d-987e841033c5',
      },
    });
    expect(mocks.persistUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.stream.mock.invocationCallOrder[0]!,
    );
  });

  it('does not call the provider when a Free user turn cannot be saved', async () => {
    mocks.persistUser.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await post({
      user_message: { id: '72d14f7e-0b3d-40c7-952d-987e841033c5', metadata: {} },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'user_message_persistence_failed' },
    });
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('serves a ready model with the platform key under managed trust, metered at zero cost', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }] }),
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
        }),
        '[DONE]',
      ),
    );
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"content":"Hi"');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0]![0]).toBe(model);
    expect(mocks.stream.mock.calls[0]![1]).toBe(API_KEY);
    expect(mocks.egress).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'managed', routeKeyAttribution: 'platform-key' }),
    );
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect((await sharedState()).used.get(model!)).toBe(15);
  });

  it('meters every input and output token the provider reports', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 40, completion_tokens: 2, total_tokens: 5 },
        }),
        '[DONE]',
      ),
    );
    await (await post()).text();
    expect((await sharedState()).used.get(model!)).toBe(42);
  });

  it('sends a user-owned image to a vision-capable free chat model without paid inference', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [{ index: 0, delta: { content: 'A small image' }, finish_reason: null }],
        }),
        '[DONE]',
      ),
    );
    const response = await post(
      {
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image' },
              { type: 'file', file: { asset_id: MEDIA_ASSET_ID } },
            ],
          },
        ],
      },
      'vision-image-turn',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('A small image');
    expect(mocks.hydrate).toHaveBeenCalledOnce();
    expect(mocks.stream.mock.calls[0]![3].messages[0].content).toEqual([
      { type: 'text', text: 'Describe this image' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
    ]);
    expect(mocks.otherProvider).not.toHaveBeenCalled();
  });

  it('rejects a non-image attachment even if hydration turns it into image parts', async () => {
    mocks.hydrate.mockImplementationOnce(async (messages) => {
      messages.at(-1).content = [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
      ];
      return [{ filename: 'scan.pdf', mimeType: 'application/pdf', base64: 'cGRm' }];
    });
    const response = await post(
      {
        model: visionModel,
        messages: [
          { role: 'user', content: [{ type: 'file', file: { asset_id: MEDIA_ASSET_ID } }] },
        ],
      },
      'vision-pdf-turn',
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('free_quota_file_unsupported');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('settles a completed free turn even if the provider leaves its stream open after done', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: 'stop' }] })}`,
              `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } })}`,
              'data: [DONE]',
              '',
            ].join('\n\n'),
          ),
        );
      },
      cancel,
    });
    mocks.stream.mockResolvedValue(new Response(body));

    const response = await post();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"content":"Hello"');
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect((await sharedState()).used.get(model!)).toBe(15);
  });

  it('offers nothing when the allowance meter cannot be read', async () => {
    vi.spyOn(mocks.store, 'batch').mockImplementation(() => {
      throw new Error('store unreachable');
    });
    const response = await post();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('sends nothing when the allowance meter cannot be written', async () => {
    vi.spyOn(mocks.store, 'increment').mockRejectedValue(new Error('store unreachable'));
    const response = await post();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('free_quota_unavailable');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('refuses every model without a provider call until the setting is attested', async () => {
    mocks.store = createMemoryKeyValueStore();
    const response = await post();
    expect(response.status).toBe(503);
    const { error } = await response.json();
    expect(error.code).toBe('free_quota_unavailable');
    expect(error.message).toContain(`${modelName} from ${inventory.issuer}`);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('does not apply an account-level Free plan usage limit', async () => {
    mocks.begin.mockResolvedValue({ ok: false, code: 'budget_reached' });
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    const response = await post();
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.stream).toHaveBeenCalledOnce();
  });

  it('refuses a plan the free models are not mapped to', async () => {
    mocks.plan.mockResolvedValue('pro');
    const response = await post();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('model_not_available');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('allows a paid image entitlement to use a promotional image without entering paid inference', async () => {
    mocks.plan.mockResolvedValue('pro');
    mocks.media.mockResolvedValue({ status: 'succeeded', artifactUrl: PROVIDER_ARTIFACT_URL });

    const response = await post({ model: imageModel }, 'paid-image-turn');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`/api/files/${MEDIA_ASSET_ID}`);
    expect(mocks.media).toHaveBeenCalledOnce();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it.each([
    ['image', imageModel],
    ['video', videoModel],
  ])(
    'refuses promotional %s generation on a Free plan before provider dispatch',
    async (_kind, selectedModel) => {
      const response = await post({ model: selectedModel }, `free-${_kind}-turn`);

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('model_not_available');
      expect(mocks.media).not.toHaveBeenCalled();
      expect(mocks.stream).not.toHaveBeenCalled();
    },
  );

  it('refuses promotional video on Pro before any provider request', async () => {
    mocks.plan.mockResolvedValue('pro');

    const response = await post({ model: videoModel }, 'pro-video-turn');

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('model_not_available');
    expect(mocks.media).not.toHaveBeenCalled();
  });

  it('allows promotional video on a video-entitled plan without paid inference', async () => {
    mocks.plan.mockResolvedValue('max_15x');
    mocks.media.mockResolvedValue({ status: 'succeeded', artifactUrl: PROVIDER_ARTIFACT_URL });
    mocks.download.mockResolvedValue({
      data: Buffer.from('generated-video'),
      contentType: 'video/mp4',
    });

    const response = await post({ model: videoModel }, 'max-video-turn');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`/api/files/${MEDIA_ASSET_ID}`);
    expect(mocks.media).toHaveBeenCalledOnce();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('names the provider and the model, not the account, when the free allowance is spent', async () => {
    mocks.stream.mockResolvedValue(
      Response.json(
        { error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' } },
        { status: 403 },
      ),
    );
    const response = await post();
    expect(response.status).toBe(409);
    const { error } = await response.json();
    expect(error.code).toBe('free_quota_exhausted');
    expect(error.message).toContain(`${inventory.issuer}'s free allowance for ${modelName}`);
    expect(error.message).toContain('not a limit on your account');
    expect(error.message).not.toContain('raw provider sentence');
    expect((await sharedState()).holds.get(model!)).toBe('exhausted');
  });

  it('withdraws a model for every account on a billing signal and never calls it again', async () => {
    mocks.stream.mockResolvedValue(
      Response.json({ error: { message: 'Payment required' } }, { status: 402 }),
    );
    expect((await post()).status).toBe(409);
    expect((await sharedState()).holds.get(model!)).toBe('billing');

    const again = await post(
      { assistant_message_id: '72d14f7e-0b3d-40c7-952d-987e841033c5' },
      'another-turn',
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe('free_quota_exhausted');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('withdraws every model when the provider reports an account billing state', async () => {
    mocks.stream.mockResolvedValue(
      Response.json(
        { code: 'Arrearage', message: 'account not in good standing' },
        { status: 400 },
      ),
    );
    expect((await post()).status).toBe(503);
    const other = await post(
      { model: second, assistant_message_id: '82d14f7e-0b3d-40c7-952d-987e841033c5' },
      'second-model',
    );
    expect(other.status).toBe(503);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect((await sharedState()).suspendedAtMs).not.toBeNull();
  });

  it('refuses the same turn twice without a second provider call', async () => {
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    await (await post()).text();
    const duplicate = await post();
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe('free_quota_duplicate');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('replaces a provider error inside the stream with its own words and records it', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Par' }, finish_reason: null }] }),
        JSON.stringify({
          error: { code: 'AllocationQuota.FreeTierOnly', message: 'raw provider sentence' },
        }),
        '[DONE]',
      ),
    );
    const text = await (await post()).text();
    expect(text).toContain('x_stream_error');
    expect(text).toContain('free_quota_exhausted');
    expect(text).not.toContain('raw provider sentence');
    expect((await sharedState()).holds.get(model!)).toBe('exhausted');
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('says the reply stopped when the provider stream ends early, and keeps the reservation', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'Par' }, finish_reason: null }] }),
      ),
    );
    const text = await (await post()).text();
    expect(text).toContain('stream_interrupted');
    expect(mocks.settle).not.toHaveBeenCalled();
    expect((await sharedState()).used.get(model!)).toBeGreaterThan(0);
  });

  it('turns a clean but empty free provider stream into a visible error', async () => {
    mocks.stream.mockResolvedValue(sse('[DONE]'));
    const text = await (await post()).text();
    expect(text).toContain('free_model_empty_response');
    expect(text).toContain('choose another free model');
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it('does not trust an upstream x_stream_error message', async () => {
    mocks.stream.mockResolvedValue(
      sse(
        JSON.stringify({
          choices: [
            {
              delta: {
                x_stream_error: { message: 'private provider diagnostic', code: 'upstream' },
              },
            },
          ],
        }),
        '[DONE]',
      ),
    );
    const text = await (await post()).text();
    expect(text).toContain('provider_unreachable');
    expect(text).not.toContain('private provider diagnostic');
  });

  it('fits the reply to what is left of the shared allowance and refuses a turn that cannot fit', async () => {
    const entry = inventory.entries.find((row) => row.offeringKey === model)!;
    const usable = Math.floor(
      ((entry.limit! - (entry.consumedApproximate ?? 0)) *
        loadFreeQuotaPolicy().allowanceUsablePercent) /
        100,
    );
    await reserveFreeQuotaAllowance(mocks.store, {
      apiKey: API_KEY,
      observedOn: inventory.observedOn,
      offeringKey: model!,
      expiresOn: entry.expiresOn,
      units: usable - 1_000,
      usable,
      nowMs: Date.now(),
    });
    const tooLong = await post({ messages: [{ role: 'user', content: 'x'.repeat(2_000) }] });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error.code).toBe('context_length_exceeded');
    expect(mocks.stream).not.toHaveBeenCalled();

    mocks.stream.mockResolvedValue(sse('[DONE]'));
    await (await post({}, 'short-turn')).text();
    expect(mocks.stream.mock.calls[0]![2].maxOutputTokens).toBeLessThanOrEqual(1_000);
  });

  it('refuses tools and attachments before any provider call', async () => {
    const search = await post({ web_search: true });
    expect(search.status).toBe(400);
    expect((await search.json()).error.code).toBe('free_quota_search_unsupported');
    expect((await post({ messages: [{ role: 'user', content: [] }] })).status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('does not send an explicit web-search request to a text-only free offering', async () => {
    const response = await post({
      messages: [
        { role: 'user', content: 'Search the web for the official IANA page and cite it.' },
      ],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: 'free_quota_search_unsupported',
      message: expect.stringContaining('search-capable Free model'),
    });
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('refuses an explicit URL-fetch request before the promotional provider call', async () => {
    const response = await post({
      messages: [{ role: 'user', content: 'Summarize https://www.iana.org/help/example-domains.' }],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('free_quota_search_unsupported');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('does not let a text-only free offering fabricate a requested code-execution result', async () => {
    const response = await post({
      messages: [{ role: 'user', content: 'Run Python to calculate 17 * 19.' }],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: 'free_quota_code_unsupported',
      message: expect.stringContaining('Free Auto'),
    });
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('respects a workspace data region', async () => {
    mocks.query.mockResolvedValue([{ id: 'conversation', data_region: 'us' }]);
    const response = await post();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('organization_policy');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('stores a zero-cost image for an entitled paid user as an owner-scoped Library asset', async () => {
    mocks.plan.mockResolvedValue('pro');
    mocks.media.mockResolvedValue({ status: 'succeeded', artifactUrl: PROVIDER_ARTIFACT_URL });

    const response = await post({
      model: imageModel,
      messages: [{ role: 'user', content: 'Create a HELLO QA poster' }],
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(mocks.download).toHaveBeenCalledWith(PROVIDER_ARTIFACT_URL);
    expect(mocks.moderateMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'fixture-user',
        media: 'image',
        mimeType: 'image/png',
      }),
    );
    expect(mocks.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'fixture-user',
        organizationId: null,
        conversationId: '52d14f7e-0b3d-40c7-952d-987e841033c5',
        origin: 'free_quota',
        model: imageModel,
        extraMetadata: expect.objectContaining({
          freeQuotaOffering: imageModel,
          aiAct: expect.objectContaining({ kind: 'image' }),
        }),
      }),
      expect.objectContaining({ query: mocks.query }),
    );
    expect(body).toContain(`/api/files/${MEDIA_ASSET_ID}`);
    expect(body).not.toContain(PROVIDER_ARTIFACT_URL);
  });

  it('never exposes the provider URL when generated image persistence fails', async () => {
    mocks.plan.mockResolvedValue('pro');
    mocks.media.mockResolvedValue({ status: 'succeeded', artifactUrl: PROVIDER_ARTIFACT_URL });
    mocks.persist.mockResolvedValue({ ok: false, reason: 'storage_error' });

    const response = await post({ model: imageModel });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain('stream_interrupted');
    expect(body).not.toContain(PROVIDER_ARTIFACT_URL);
  });

  it('withholds a blocked generated image before persistence', async () => {
    mocks.plan.mockResolvedValue('pro');
    mocks.media.mockResolvedValue({ status: 'succeeded', artifactUrl: PROVIDER_ARTIFACT_URL });
    mocks.moderateMedia.mockResolvedValue({
      allowed: false,
      refusal: 'Generated media withheld.',
      reason: 'output_classifier',
      categories: ['likeness'],
      ruleIds: ['managed-image.output.classifier'],
      contentSha256: 'b'.repeat(64),
    });

    const response = await post({ model: imageModel });

    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toBe('Generated media withheld.');
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});

describe('no paid route is reachable from a free quota turn', () => {
  it.each([
    ['a spent allowance', 403, { error: { code: 'AllocationQuota.FreeTierOnly' } }],
    ['a billing refusal', 402, { error: { message: 'Payment required' } }],
    ['an account billing state', 400, { code: 'Arrearage' }],
    ['a rate limit', 429, { code: 'Throttling.RateQuota' }],
    ['a provider fault', 500, { code: 'InternalError' }],
    ['a context overflow', 400, { error: { message: 'maximum context length exceeded' } }],
  ])('answers %s with a refusal and no second dispatch', async (_label, status, body) => {
    mocks.stream.mockResolvedValue(Response.json(body, { status }));
    const response = await post();
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.media).not.toHaveBeenCalled();
    expect(mocks.otherProvider).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('answers a network failure with a refusal and no second dispatch', async () => {
    mocks.stream.mockRejectedValue(new TypeError('fetch failed'));
    const response = await post();
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe('stream_interrupted');
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.otherProvider).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
