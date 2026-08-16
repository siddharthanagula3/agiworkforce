
import { describe, expect, it } from 'vitest';
import { getTaskModelForProvider, type StreamChunk } from '@agiworkforce/types';

import { createOpenAIAdapter } from './index';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const apiKey = process.env['OPENAI_API_KEY'];
const skip = !liveEnabled || !apiKey;
const LIVE_MODEL_ID = getTaskModelForProvider('openai', 'fast_completion');

if (!LIVE_MODEL_ID) {
  throw new Error('The canonical OpenAI fast-completion route must exist');
}

describe.skipIf(skip)('OpenAI adapter live', () => {
  it('streams a tiny completion end-to-end', async () => {
    const adapter = createOpenAIAdapter({ apiKey, skipDiscovery: true });

    const ctrl = new AbortController();
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream(
      {
        model: LIVE_MODEL_ID,
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        maxOutputTokens: 32,
      },
      ctrl.signal,
    )) {
      chunks.push(chunk);
      if (chunks.length > 200) {
        ctrl.abort();
        break;
      }
    }

    const text = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    const usage = chunks.find((c) => c.type === 'usage');
    const stop = chunks.find((c) => c.type === 'stop');
    const errors = chunks.filter((c) => c.type === 'error');

    expect(errors, `expected no error chunks, got: ${JSON.stringify(errors)}`).toHaveLength(0);
    expect(text.length).toBeGreaterThan(0);
    expect(usage).toBeDefined();
    expect(stop).toBeDefined();
    expect(stop?.type === 'stop' && stop.reason).not.toBe('error');
  }, 30_000);

  it('exposes a non-empty model catalog', async () => {
    const adapter = createOpenAIAdapter({ apiKey, skipDiscovery: true });
    const catalog = await adapter.catalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((m) => m.provider === 'openai')).toBe(true);
  });
});

describe.skipIf(!skip)('OpenAI adapter live (skipped)', () => {
  it.skip('set AGIWORKFORCE_LIVE_TEST=1 + OPENAI_API_KEY to run', () => {});
});
