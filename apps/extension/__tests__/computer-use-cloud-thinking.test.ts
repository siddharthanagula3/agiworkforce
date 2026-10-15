import { afterEach, describe, expect, it, vi } from 'vitest';
import { callCloud, DEFAULT_GATEWAY_BASE } from '../src/features/computer-use/cloudAgentClient';

function wireResponse(frames: unknown[], byteWidth = 7): Response {
  const wire =
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(wire);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += byteWidth)
          controller.enqueue(bytes.slice(offset, offset + byteWidth));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('browser cloud reasoning text', () => {
  it('assembles only public text when both SSE bytes and reasoning tags are arbitrarily split', async () => {
    const text = '<thinking></thinking>Hello<thinking>private reasoning</thinking>, Ada.';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        wireResponse(
          Array.from(text).map((content) => ({
            choices: [{ delta: { content }, finish_reason: null }],
          })),
          1,
        ),
      ),
    );
    const result = await callCloud(
      [{ role: 'user', content: 'Read the page' }],
      'test-token',
      DEFAULT_GATEWAY_BASE,
    );
    expect(result.message.content).toBe('Hello, Ada.');
    expect(result.isDone).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private reasoning');
  });

  it('preserves tool fragments and reported usage while suppressing inline reasoning', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        wireResponse([
          { choices: [{ delta: { content: '<thinking>private' }, finish_reason: null }] },
          {
            choices: [
              {
                delta: {
                  content: '</thinking>',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-click',
                      type: 'function',
                      function: { name: 'click', arguments: '{"index":' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { total_tokens: 27 },
          },
        ]),
      ),
    );
    const result = await callCloud(
      [{ role: 'user', content: 'Click the button' }],
      'test-token',
      DEFAULT_GATEWAY_BASE,
    );
    expect(result.message.content).toBeNull();
    expect(result.message.tool_calls).toEqual([
      { id: 'call-click', type: 'function', function: { name: 'click', arguments: '{"index":1}' } },
    ]);
    expect(result.tokensUsed).toBe(27);
    expect(result.isDone).toBe(true);
  });

  it('preserves ordinary code and keeps malformed private closers out of the answer', async () => {
    const publicText = '```ts\nif (a < b) return "<think>";\n```';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        wireResponse([
          { choices: [{ delta: { content: publicText }, finish_reason: null }] },
          { choices: [{ delta: { content: '<thinking>hidden</think' }, finish_reason: 'stop' }] },
        ]),
      ),
    );
    const result = await callCloud(
      [{ role: 'user', content: 'Describe the page' }],
      'test-token',
      DEFAULT_GATEWAY_BASE,
    );
    expect(result.message.content).toBe(publicText);
  });
});
