import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { streamFreeChat } from '../src/features/cloud-bridge/freeTrialClient';

/**
 * A signed-out side panel gets a 200 HTML sign-in page, not an event stream.
 * Parsing that as SSE reported "Malformed response from AGI Cloud", which
 * blamed the protocol for what is really an expired session.
 */
function htmlResponse(): Response {
  return new Response('<!doctype html><html><body>Sign in</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out as Array<{ type: string; message?: string; code?: string }>;
}

describe('managed chat response must be an event stream', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse()),
    );
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('names the expired session instead of blaming the protocol', async () => {
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'what can you do?' }], 'a-token'),
    );
    const error = chunks.find((c) => c.type === 'error');
    expect(error).toBeDefined();
    expect(error?.code).toBe('auth_required');
    expect(error?.message).toContain('session has expired');
    expect(error?.message).not.toContain('Malformed response');
  });

  it('names what happened rather than the transport, and logs the type for support', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"ok":true}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const chunks = await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));
    const error = chunks.find((c) => c.type === 'error');
    expect(error?.code).toBe('protocol_error');
    expect(error?.message).toBe(
      'AGI Cloud did not return a response stream for this turn. Try again.',
    );
    expect(error?.message).not.toContain('application/json');
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'application/json');
    warn.mockRestore();
  });
});
