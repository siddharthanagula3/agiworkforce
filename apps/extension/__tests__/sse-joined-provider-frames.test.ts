import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { streamFreeChat } from '../src/features/cloud-bridge/freeTrialClient';

/**
 * The side panel reported "Malformed response from AGI Cloud." on a healthy
 * stream. Cause: the server forwards raw provider lines as `raw + '\n'` and
 * skips the provider's blank separator lines
 * (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts, collectProviderStream
 * pushLine and emitProviderLine), so consecutive frames reach this client as one
 * multi-line `data:` payload. Its own frames are terminated with `\n\n`, which is
 * why the failure only appeared on some turns.
 *
 * apps/web/lib/hooks/useChatStream.ts collectEventPayloads already tolerates
 * this, which is why the same server answers the web page and not the panel.
 */
function joinedProviderFrames(frames: string[]): string {
  return frames.map((frame) => `data: ${frame}\n`).join('');
}

function chunkFrame(content: string): string {
  return JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content } }],
  });
}

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out as Array<{ type: string; text?: string; message?: string; code?: string }>;
}

function run(body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => sseResponse(body)),
  );
  return collect(streamFreeChat([{ role: 'user', content: 'hi' }], 'a-token'));
}

describe('provider frames forwarded without a blank separator', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('reads every frame of a run that arrives joined', async () => {
    const chunks = await run(
      joinedProviderFrames([chunkFrame('chrome '), chunkFrame('standalone '), chunkFrame('ok')]) +
        'data: [DONE]\n\n',
    );

    expect(chunks.find((chunk) => chunk.type === 'error')).toBeUndefined();
    expect(
      chunks
        .filter((chunk) => chunk.type === 'text')
        .map((chunk) => chunk.text)
        .join(''),
    ).toBe('chrome standalone ok');
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it('reaches the terminal event when the last frame is joined to [DONE]', async () => {
    const chunks = await run(joinedProviderFrames([chunkFrame('ok'), '[DONE]']) + '\n');

    expect(chunks.find((chunk) => chunk.type === 'error')).toBeUndefined();
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it('keeps a legitimate pretty-printed frame whole', async () => {
    const pretty = JSON.stringify(
      { id: 'chatcmpl-1', choices: [{ index: 0, delta: { content: 'pretty' } }] },
      null,
      2,
    );
    const chunks = await run(
      pretty
        .split('\n')
        .map((line) => `data: ${line}\n`)
        .join('') +
        '\n' +
        'data: [DONE]\n\n',
    );

    expect(chunks.find((chunk) => chunk.type === 'error')).toBeUndefined();
    expect(chunks.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.text)).toEqual([
      'pretty',
    ]);
  });

  it('still rejects a payload that is not a run of frames', async () => {
    const chunks = await run('data: {"choices": broken\ndata: also broken\n\n');

    expect(chunks.find((chunk) => chunk.type === 'error')?.message).toContain(
      'Malformed response from AGI Cloud',
    );
  });
});
