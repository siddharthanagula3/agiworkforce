import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({ captureModelFailure: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(),
  listAvailableManagedProviderIds: () => new Set<string>(),
  resolveProviderFromModel: (model: string) => model,
  toGenericUpstreamError: vi.fn(),
}));
vi.mock('@/lib/observability/error-capture', () => ({
  captureModelFailure: mocks.captureModelFailure,
}));

import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';

import { startProviderStream } from './adapter-factory';

const PROVIDER_REQUEST_ID = 'chatcmpl-9f3a';
const MODEL = 'fixture-model';

function adapterYielding(...chunks: StreamChunk[]): ProviderAdapter {
  return {
    id: 'openai',
    label: 'fixture',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    async *stream() {
      for (const chunk of chunks) yield chunk;
    },
  } satisfies ProviderAdapter;
}

const chatRequest = { model: MODEL, messages: [] } as unknown as ChatRequest;

const mapError = (chunk: Extract<StreamChunk, { type: 'error' }>): Error =>
  new Error(chunk.message ?? 'provider error');

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The provider's own request id is the only handle support has when a user
 * reports a bad turn and the provider asks which call they mean. Every adapter
 * reaches the model through this one function, so setting it here is what makes
 * the field consistent rather than per-adapter.
 */
describe('provider request id correlation', () => {
  it('records the provider request id, response model and provider on the stream span', async () => {
    const meta = {
      type: 'response-meta' as const,
      id: PROVIDER_REQUEST_ID,
      model: MODEL,
      provider: 'openai',
    };
    const stream = await startProviderStream(
      adapterYielding(meta as StreamChunk, { type: 'stop', reason: 'end_turn' }),
      chatRequest,
      new AbortController().signal,
      mapError,
    );

    const seen: StreamChunk[] = [];
    for await (const chunk of stream) seen.push(chunk);
    expect(seen[0]).toMatchObject({ id: PROVIDER_REQUEST_ID });
    expect(OBSERVABILITY_ATTRIBUTE.providerRequestId).toBe('agi.provider.request_id');
  });

  it('files a provider error as a model failure with the provider, model and code', async () => {
    await expect(
      startProviderStream(
        adapterYielding({
          type: 'error',
          code: '503',
          message: 'upstream unavailable',
        } as StreamChunk),
        chatRequest,
        new AbortController().signal,
        mapError,
      ),
    ).rejects.toThrow('upstream unavailable');

    expect(mocks.captureModelFailure).toHaveBeenCalledWith(expect.any(Error), {
      provider: 'openai',
      model: MODEL,
      errorCode: '503',
    });
  });

  it('names a code even when the provider refused without one', async () => {
    await expect(
      startProviderStream(
        adapterYielding({ type: 'error', message: 'connection reset' } as StreamChunk),
        chatRequest,
        new AbortController().signal,
        mapError,
      ),
    ).rejects.toThrow('connection reset');

    expect(mocks.captureModelFailure).toHaveBeenCalledWith(expect.any(Error), {
      provider: 'openai',
      model: MODEL,
      errorCode: 'unknown',
    });
  });

  it('does not file a failure for a stream that opened cleanly', async () => {
    const meta = {
      type: 'response-meta' as const,
      id: PROVIDER_REQUEST_ID,
      model: MODEL,
      provider: 'openai',
    };
    const stream = await startProviderStream(
      adapterYielding(meta as StreamChunk, { type: 'stop', reason: 'end_turn' }),
      chatRequest,
      new AbortController().signal,
      mapError,
    );
    for await (const chunk of stream) void chunk;

    expect(mocks.captureModelFailure).not.toHaveBeenCalled();
  });
});
