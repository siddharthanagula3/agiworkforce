import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { streamFreeChat } from '../src/features/cloud-bridge/freeTrialClient';

/**
 * The side panel reported "Malformed response from AGI Cloud." mid-run against
 * a healthy server. Cause: the client carried a hand-maintained allowlist of
 * delta keys, the server had since grown seven more, and an unlisted key was
 * treated as a protocol error rather than an extension field to ignore.
 *
 * Every key below is one the server emits today, taken from
 * apps/web/app/api/llm/v1/chat/completions/lib. An `x_` prefix means vendor
 * extension: a newer server must never hard-fail an older client.
 */
const SERVER_EMITTED_VENDOR_KEYS = [
  'x_agi_workforce',
  'x_agiwork_plan',
  'x_interactive_cards',
  'x_research_plan',
  'x_research_status',
  'x_stream_error',
  'x_tool_input_request',
] as const;

function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `data: ${f}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function deltaFrame(key: string): string {
  // No `index`, no `finish_reason`: those are independently recognised, so
  // including one would mask whether the VENDOR key was accepted. This isolates
  // the key under test.
  return JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [{ delta: { [key]: { some: 'payload' } } }],
  });
}

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out as Array<{ type: string; message?: string; code?: string; value?: string }>;
}

describe('unknown vendor delta keys are ignored, not fatal', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(SERVER_EMITTED_VENDOR_KEYS)('does not blame the protocol for %s', async (key) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([deltaFrame(key)])),
    );

    const chunks = await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));
    const error = chunks.find((c) => c.type === 'error');

    // A stream carrying ONLY a vendor frame and no text has nothing renderable,
    // so the terminal "completed without a result" error is legitimate and
    // shares the protocol_error code. The symptom under test is the FRAME being
    // rejected, which surfaces as this exact sentence in the side panel.
    expect(error?.message ?? '', `${key} must not be rejected as a malformed frame`).not.toContain(
      'Malformed response from AGI Cloud',
    );
  });

  it('still delivers content emitted alongside an unknown key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          deltaFrame('x_research_status'),
          JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: 'hello' } }],
          }),
        ]),
      ),
    );

    const chunks = await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));

    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    expect(JSON.stringify(chunks)).toContain('hello');
  });

  it('still rejects a frame that is genuinely malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion.chunk',
            choices: [{ delta: { totally_unknown: 1 } }],
          }),
        ]),
      ),
    );

    const chunks = await collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));

    expect(chunks.find((c) => c.type === 'error')?.code).toBe('protocol_error');
  });
});
