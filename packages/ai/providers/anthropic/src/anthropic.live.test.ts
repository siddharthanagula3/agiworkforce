/**
 * Anthropic adapter live smoke test.
 *
 * Hits api.anthropic.com with a tiny prompt and asserts the stream produces
 * the canonical chunks (text-delta, usage, stop). Skipped unless both
 * `AGIWORKFORCE_LIVE_TEST=1` and `ANTHROPIC_API_KEY` are set.
 *
 * Run: `pnpm --filter @agiworkforce/providers-anthropic test:live`
 *
 * Cost: ~5-50 tokens per invocation (tiny prompt + 32 token cap).
 */

import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { createAnthropicAdapter } from './index';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const apiKey = process.env['ANTHROPIC_API_KEY'];
const skip = !liveEnabled || !apiKey;

// llm-guardrail-allow: env-gated live-provider test; makes real paid API calls, deliberately skipped without keys
describe.skipIf(skip)('Anthropic adapter live', () => {
  it('streams a tiny completion end-to-end', async () => {
    const adapter = createAnthropicAdapter({ apiKey });

    const ctrl = new AbortController();
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream(
      {
        model: 'claude-haiku-4.5',
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        maxOutputTokens: 32,
      },
      ctrl.signal,
    )) {
      chunks.push(chunk);
      // Hard cap on chunks to prevent runaway tests.
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
    const adapter = createAnthropicAdapter({ apiKey });
    const catalog = await adapter.catalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((m) => m.provider === 'anthropic')).toBe(true);
  });
});

// llm-guardrail-allow: visible placeholder row so skipped live suites stay discoverable in test output
describe.skipIf(!skip)('Anthropic adapter live (skipped)', () => {
  it.skip('set AGIWORKFORCE_LIVE_TEST=1 + ANTHROPIC_API_KEY to run', () => {});
});
