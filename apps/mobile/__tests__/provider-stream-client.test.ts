import { ReadableStream } from 'node:stream/web';

import { streamFromProvider } from '@/lib/providerStreamClient';
import { secureFetch } from '@/services/secureFetch';

jest.mock('@/services/secureFetch', () => ({
  secureFetch: jest.fn(),
}));

const secureFetchMock = secureFetch as jest.MockedFunction<typeof secureFetch>;

function makeBody(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

async function collectStream(params: Partial<Parameters<typeof streamFromProvider>[0]> = {}) {
  const chunks = [];
  for await (const chunk of streamFromProvider({
    gatewayUrl: 'https://api.agi.test',
    providerId: 'qwen',
    authToken: 'cloud-token',
    request: {
      model: 'qwen-max',
      messages: [{ role: 'user', content: 'hello' }],
    },
    ...params,
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('provider stream client', () => {
  beforeEach(() => {
    secureFetchMock.mockReset();
  });

  it('routes managed providers through the gateway with auth and mobile headers', async () => {
    secureFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeBody('data: [DONE]\n\n'),
    } as Response);

    await collectStream({ providerId: 'moonshot', request: { model: 'kimi-k2.6', messages: [] } });

    expect(secureFetchMock).toHaveBeenCalledWith(
      'https://api.agi.test/api/v1/providers/moonshot/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer cloud-token',
          'content-type': 'application/json',
          'x-requested-with': 'agiworkforce-mobile',
        }),
        body: JSON.stringify({ model: 'kimi-k2.6', messages: [] }),
        signal: expect.any(AbortSignal),
      }),
      // Streaming requests opt into expo/fetch so `res.body` is a real
      // ReadableStream (token-by-token); guardedFetch threads this to secureFetch.
      { stream: true },
    );
  });

  it('emits a non-retryable error chunk for malformed SSE JSON', async () => {
    secureFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeBody('data: {"type"\n\n'),
    } as Response);

    await expect(collectStream()).resolves.toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'MALFORMED_SSE_FRAME',
        retryable: false,
      }),
    );
  });

  it('emits a retryable error and error stop when the fetch fails before a caller abort', async () => {
    secureFetchMock.mockRejectedValue(new Error('network down'));

    await expect(collectStream()).resolves.toEqual([
      expect.objectContaining({
        type: 'error',
        code: 'STREAM_FETCH_ERROR',
        retryable: true,
      }),
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('emits a cancel stop when the caller aborts the request', async () => {
    const controller = new AbortController();
    controller.abort();
    secureFetchMock.mockRejectedValue(new Error('cancelled'));

    await expect(collectStream({ signal: controller.signal })).resolves.toEqual([
      expect.objectContaining({
        type: 'error',
        code: 'STREAM_TIMEOUT_OR_ABORT',
        retryable: false,
      }),
      { type: 'stop', reason: 'cancel' },
    ]);
  });
});
