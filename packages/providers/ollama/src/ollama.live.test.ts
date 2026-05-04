/**
 * Ollama adapter live smoke test.
 *
 * Probes a local Ollama daemon at `http://localhost:11434` (or
 * `OLLAMA_BASE_URL` if set) and runs a tiny prompt against the first model
 * it can find. Skipped unless `AGIWORKFORCE_LIVE_TEST=1` is set AND the
 * daemon responds to `/api/tags`.
 *
 * Run: `pnpm --filter @agiworkforce/providers-ollama test:live`
 *
 * Cost: free (local).
 */

import { afterAll, describe, expect, it, beforeAll } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { createOllamaAdapter } from './index';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const baseUrl = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';

let daemonAvailable = false;
let firstModel: string | undefined;

beforeAll(async () => {
  if (!liveEnabled) return;
  try {
    const adapter = createOllamaAdapter({ baseUrl });
    const catalog = await adapter.catalog();
    if (catalog.length > 0) {
      daemonAvailable = true;
      firstModel = catalog[0]?.id;
    }
  } catch {
    daemonAvailable = false;
  }
});

const skip = !liveEnabled;

describe.skipIf(skip)('Ollama adapter live', () => {
  it('streams a tiny completion end-to-end (or skips if no daemon)', async () => {
    if (!daemonAvailable || !firstModel) {
      console.log(`  Ollama daemon not reachable at ${baseUrl} — skipping stream test`);
      return;
    }
    const adapter = createOllamaAdapter({ baseUrl });
    const ctrl = new AbortController();
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream(
      {
        model: firstModel,
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
    const stop = chunks.find((c) => c.type === 'stop');
    const errors = chunks.filter((c) => c.type === 'error');

    expect(errors, `expected no error chunks, got: ${JSON.stringify(errors)}`).toHaveLength(0);
    expect(text.length).toBeGreaterThan(0);
    expect(stop).toBeDefined();
  }, 60_000);

  it('exposes a (possibly empty) model catalog', async () => {
    const adapter = createOllamaAdapter({ baseUrl });
    const catalog = await adapter.catalog();
    expect(catalog).toBeInstanceOf(Array);
    expect(catalog.every((m) => m.provider === 'ollama')).toBe(true);
  });
});

afterAll(() => {
  if (liveEnabled && !daemonAvailable) {
    console.log(
      `  note: Ollama daemon not reachable at ${baseUrl}. Stream test skipped; catalog test ran but returned [].`,
    );
  }
});

describe.skipIf(!skip)('Ollama adapter live (skipped)', () => {
  it('skipped — set AGIWORKFORCE_LIVE_TEST=1 to run', () => {
    expect(true).toBe(true);
  });
});
