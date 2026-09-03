import { describe, expect, it } from 'vitest';
import { getModelsForProvider } from '@agiworkforce/types';

import { createPerplexityAdapter } from '../index';

const perplexityFastModel = getModelsForProvider('perplexity').find(
  (model) => model.qualityTier === 'fast',
);
if (!perplexityFastModel) {
  throw new Error('The canonical Perplexity fast-tier fixture must exist');
}
const PERPLEXITY_FAST_MODEL_ID = perplexityFastModel.id;

describe('createPerplexityAdapter', () => {
  it('returns adapter with id="perplexity" and label="Perplexity"', () => {
    const adapter = createPerplexityAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('perplexity');
    expect(adapter.label).toBe('Perplexity');
  });

  it('declares an api-key auth method with envVar PERPLEXITY_API_KEY', () => {
    const adapter = createPerplexityAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('PERPLEXITY_API_KEY');
    }
  });

  it('requests stream_options.include_usage=true on the wire', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createPerplexityAdapter({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        seenBody = JSON.parse(String(init?.body));
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });

    for await (const _chunk of adapter.stream(
      { model: PERPLEXITY_FAST_MODEL_ID, messages: [{ role: 'user', content: 'ping' }] },
      new AbortController().signal,
    )) {
      void _chunk;
    }

    expect(
      (seenBody?.stream_options as { include_usage?: boolean } | undefined)?.include_usage,
    ).toBe(true);
  });

  it('surfaces inputTokens and outputTokens from a plain usage object with no cache fields', async () => {
    const adapter = createPerplexityAdapter({
      apiKey: 'test-key',
      fetch: async () => {
        const body =
          `data: ${JSON.stringify({
            id: 'x',
            object: 'chat.completion.chunk',
            created: 0,
            model: PERPLEXITY_FAST_MODEL_ID,
            choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
          })}\n\n` +
          `data: ${JSON.stringify({
            id: 'x',
            object: 'chat.completion.chunk',
            created: 0,
            model: PERPLEXITY_FAST_MODEL_ID,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 30, completion_tokens: 4, total_tokens: 34 },
          })}\n\n` +
          `data: [DONE]\n\n`;
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });

    const chunks = [];
    for await (const chunk of adapter.stream(
      { model: PERPLEXITY_FAST_MODEL_ID, messages: [{ role: 'user', content: 'ping' }] },
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    const usage = chunks.find((c) => c.type === 'usage');
    expect(usage).toBeDefined();
    if (usage?.type === 'usage') {
      expect(usage.inputTokens).toBe(30);
      expect(usage.outputTokens).toBe(4);
    }
  });
});
