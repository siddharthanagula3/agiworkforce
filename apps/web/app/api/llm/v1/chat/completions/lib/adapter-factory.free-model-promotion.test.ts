import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

type PromotionTestModule0 = typeof import('@/lib/services/provider-adapter-service');

vi.mock('server-only', () => ({}));

const upstream = vi.hoisted(() => ({ chunks: [] as unknown[] }));
const ledger = vi.hoisted(() => ({ endFreeModelPromotionCredential: vi.fn() }));

const serviceAdapter = {
  id: 'anthropic',
  label: 'Service-owned adapter',
  auth: [],
  config: {},
  async catalog() {
    return [];
  },
  async *stream() {
    for (const chunk of upstream.chunks) yield chunk as StreamChunk;
  },
} satisfies ProviderAdapter;

const buildServerProviderAdapter = vi.fn(
  (_providerId: string, _options?: Record<string, unknown>) => serviceAdapter,
);

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  buildServerProviderAdapter: (providerId: string, options?: Record<string, unknown>) =>
    buildServerProviderAdapter(providerId, options),
  buildProtocolRouteAdapter: (providerId: string) => buildServerProviderAdapter(providerId),
  listAvailableManagedProviderIds: () => new Set<string>(['anthropic']),
  resolveServerProviderCredentials: () => null,
  resolveProviderFromModel: (model: string) => model,
  toGenericUpstreamError: vi.fn(),
}));
vi.mock('@/lib/server/free-model-promotion-ledger', () => ledger);

import { buildAnthropicAdapter } from './adapter-factory';
import { ADAPTER_PROVIDERS } from './adapter-providers';
import { loadFreeModelPromotionConfig } from '@/lib/server/free-model-promotion';

const config = loadFreeModelPromotionConfig();
const isolatedCredential = config.credentials.find((candidate) => candidate.apiKey !== 'managed');
const managedCredential = config.credentials.find((candidate) => candidate.apiKey === 'managed');
const isolatedEnv =
  isolatedCredential && isolatedCredential.apiKey !== 'managed'
    ? isolatedCredential.apiKey.env
    : '';

function promotedTurn(isolated: boolean): ProcessedRequest {
  return {
    requestId: 'req-promotion-adapter',
    freeTrial: {
      kind: 'free_trial',
      userId: 'user-free',
      requestId: 'req-promotion-adapter',
      reservedMicrousd: 0,
      unmetered: true,
      promotion: {
        promotionId: config.promotionId,
        credentialId: (isolated ? isolatedCredential : managedCredential)?.id ?? '',
        isolated,
        reservedMicrousd: 150_000,
      },
    },
    chatRequest: { model: 'm', messages: [] },
    llmRequest: { model: 'm', messages: [], max_tokens: 10 },
  } as unknown as ProcessedRequest;
}

async function drain(adapter: ProviderAdapter): Promise<StreamChunk[]> {
  const seen: StreamChunk[] = [];
  for await (const chunk of adapter.stream(
    { model: 'm', messages: [] },
    new AbortController().signal,
  )) {
    seen.push(chunk);
  }
  return seen;
}

describe('the Anthropic adapter of a turn the free model promotion pays for', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    upstream.chunks = [{ type: 'stop', reason: 'end_turn' }];
    savedKey = process.env[isolatedEnv];
    process.env[isolatedEnv] = 'promotion-account-key';
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[isolatedEnv];
    else process.env[isolatedEnv] = savedKey;
  });

  it('authenticates with the promotion account key', () => {
    buildAnthropicAdapter(promotedTurn(true));

    expect(buildServerProviderAdapter).toHaveBeenCalledWith(
      'anthropic',
      expect.objectContaining({ apiKey: 'promotion-account-key' }),
    );
  });

  it('keeps the managed key for a turn reserved on the managed account', () => {
    buildAnthropicAdapter(promotedTurn(false));

    const options = buildServerProviderAdapter.mock.calls[0]?.[1] ?? {};
    expect(options).not.toHaveProperty('apiKey');
  });

  it('refuses to fall back to the managed key when the promotion key disappeared', () => {
    delete process.env[isolatedEnv];

    expect(() => buildAnthropicAdapter(promotedTurn(true))).toThrow();
  });

  it('ends the credential for the promotion when the provider refuses it for money', async () => {
    upstream.chunks = [
      {
        type: 'error',
        message: 'Your credit balance is too low to access the API',
        code: '400',
        classification: {
          category: 'billing_exhausted',
          code: 'billing_exhausted',
          retryable: false,
          fallbackable: false,
        },
      },
    ];

    const seen = await drain(buildAnthropicAdapter(promotedTurn(true)));

    expect(seen[0]?.type).toBe('error');
    expect(ledger.endFreeModelPromotionCredential).toHaveBeenCalledTimes(1);
    expect(ledger.endFreeModelPromotionCredential.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ credentialId: isolatedCredential?.id }),
    );
  });

  it('keeps the credential through a transient failure', async () => {
    upstream.chunks = [
      {
        type: 'error',
        message: 'overloaded',
        code: '529',
        classification: {
          category: 'server_overload',
          code: 'overloaded',
          retryable: true,
          fallbackable: true,
        },
      },
    ];

    await drain(buildAnthropicAdapter(promotedTurn(true)));

    expect(ledger.endFreeModelPromotionCredential).not.toHaveBeenCalled();
  });

  it('never lets another provider carry a turn reserved on the promotion account', () => {
    const openai = ADAPTER_PROVIDERS['openai'];
    if (!openai) throw new Error('expected the openai adapter entry');

    expect(() => openai.buildAdapter(promotedTurn(true))).toThrow();
  });
});
