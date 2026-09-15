import { describe, expect, it, vi, afterEach } from 'vitest';

import { streamFreeChat } from '../src/features/cloud-bridge/freeTrialClient';

const REFUSAL_SENTENCE =
  'This model is unavailable right now because of a problem on our side, not with your request. Choose another model, or try again shortly.';

function refusal(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out as Array<{ type: string; message?: string; code?: string }>;
}

describe('a gateway refusal before the stream opens', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the gateway sentence from the refusal body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        refusal(
          503,
          JSON.stringify({
            error: {
              message: REFUSAL_SENTENCE,
              type: 'service_unavailable',
              code: 'provider_billing_exhausted',
              retryable: false,
            },
          }),
        ),
      ),
    );
    const chunks = await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));
    const error = chunks.find((c) => c.type === 'error');
    expect(error?.code).toBe('server_error');
    expect(error?.message).toBe(REFUSAL_SENTENCE);
  });

  it('falls back to the status when the body is not the gateway shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => refusal(502, '<html>bad gateway</html>')),
    );
    const chunks = await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));
    const error = chunks.find((c) => c.type === 'error');
    expect(error?.code).toBe('server_error');
    expect(error?.message).toBe('AGI Cloud is temporarily unavailable (502).');
  });
});
