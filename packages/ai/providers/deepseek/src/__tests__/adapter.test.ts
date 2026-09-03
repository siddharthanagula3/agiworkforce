import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';

import { createDeepSeekAdapter } from '../index';

const DEEPSEEK_DEFAULT_MODEL_ID = requireProviderDefaultModel('deepseek');

function sseResponse(lines: string[]): Response {
  const body = lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('createDeepSeekAdapter', () => {
  it('returns adapter with id="deepseek" and label="DeepSeek"', () => {
    const adapter = createDeepSeekAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('deepseek');
    expect(adapter.label).toBe('DeepSeek');
  });

  it('declares an api-key auth method with envVar DEEPSEEK_API_KEY', () => {
    const adapter = createDeepSeekAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('DEEPSEEK_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createDeepSeekAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('deepseek');
    }
  });

  it('requests stream_options.include_usage=true on the wire', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createDeepSeekAdapter({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        seenBody = JSON.parse(String(init?.body));
        return sseResponse([]);
      },
    });

    for await (const _chunk of adapter.stream(
      { model: DEEPSEEK_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'ping' }] },
      new AbortController().signal,
    )) {
      void _chunk;
    }

    expect(
      (seenBody?.stream_options as { include_usage?: boolean } | undefined)?.include_usage,
    ).toBe(true);
  });

  it('normalizes prompt_cache_hit_tokens into a cacheReadTokens usage chunk end-to-end', async () => {
    const adapter = createDeepSeekAdapter({
      apiKey: 'test-key',
      fetch: async () =>
        sseResponse([
          JSON.stringify({
            id: 'x',
            object: 'chat.completion.chunk',
            created: 0,
            model: DEEPSEEK_DEFAULT_MODEL_ID,
            choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
          }),
          JSON.stringify({
            id: 'x',
            object: 'chat.completion.chunk',
            created: 0,
            model: DEEPSEEK_DEFAULT_MODEL_ID,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 1988,
              completion_tokens: 48,
              total_tokens: 2036,
              prompt_cache_hit_tokens: 1920,
              prompt_cache_miss_tokens: 68,
            },
          }),
        ]),
    });

    const chunks = [];
    for await (const chunk of adapter.stream(
      { model: DEEPSEEK_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'ping' }] },
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    const usage = chunks.find((c) => c.type === 'usage');
    expect(usage).toBeDefined();
    if (usage?.type === 'usage') {
      expect(usage.cacheReadTokens).toBe(1920);
      expect(usage.inputTokens).toBe(1988);
    }
  });
});
