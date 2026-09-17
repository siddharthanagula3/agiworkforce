import { describe, expect, it } from 'vitest';

import { loadDataset } from '../src/dataset';
import {
  catalogCostUsd,
  collectResponse,
  providerResponder,
  type ProviderChatRequest,
  type StreamChunkLike,
} from '../src/provider';

async function* chunks(list: readonly StreamChunkLike[]): AsyncIterable<StreamChunkLike> {
  for (const chunk of list) yield chunk;
}

function clock(...times: number[]): () => number {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)]!;
}

describe('collectResponse', () => {
  it('assembles text, tool calls, usage, provider cost and timing from the stream', async () => {
    const response = await collectResponse(
      chunks([
        { type: 'response-meta', model: 'served' },
        { type: 'text-delta', delta: 'Checking ' },
        { type: 'text-delta', delta: 'now.' },
        { type: 'tool-use-start', toolUseId: 't1', name: 'get_weather' },
        { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{"city":' },
        { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '"Oslo"}' },
        { type: 'tool-use-end', toolUseId: 't1' },
        { type: 'usage', inputTokens: 120, outputTokens: 30, costUsd: 0.0004 },
        { type: 'stop', reason: 'tool_use' },
      ]),
      clock(1000, 1250, 1900),
      { inputPerMillion: 100, outputPerMillion: 100 },
    );
    expect(response).toEqual({
      text: 'Checking now.',
      stopReason: 'tool_use',
      toolCalls: [{ id: 't1', name: 'get_weather', input: { city: 'Oslo' } }],
      usage: { inputTokens: 120, outputTokens: 30 },
      costUsd: 0.0004,
      costSource: 'provider',
      latencyMs: 900,
      ttfbMs: 250,
    });
  });

  it('prices from the route when the adapter meters tokens but not cost', async () => {
    const response = await collectResponse(
      chunks([
        { type: 'text-delta', delta: 'ok' },
        { type: 'usage', inputTokens: 1_000_000, outputTokens: 500_000 },
      ]),
      clock(0, 5, 10),
      { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    );
    expect(response.costSource).toBe('catalog');
    expect(response.costUsd).toBeCloseTo(0.3, 10);
  });

  it('reports no cost at all when nothing was metered', async () => {
    const response = await collectResponse(
      chunks([{ type: 'text-delta', delta: 'ok' }]),
      clock(0, 1, 2),
      { inputPerMillion: 1, outputPerMillion: 1 },
    );
    expect(response.costUsd).toBeUndefined();
    expect(response.usage).toBeUndefined();
  });

  it('keeps unparseable tool arguments visible instead of dropping the call', async () => {
    const response = await collectResponse(
      chunks([
        { type: 'tool-use-start', toolUseId: 't1', name: 'browser_click' },
        { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{"ref": e1' },
      ]),
      clock(0, 1, 2),
      null,
    );
    expect(response.toolCalls).toEqual([
      { id: 't1', name: 'browser_click', input: { __unparsedArguments: '{"ref": e1' } },
    ]);
  });

  it('fails the case loudly on a provider error chunk', async () => {
    await expect(
      collectResponse(chunks([{ type: 'error', message: 'rate limited' }]), clock(0), null),
    ).rejects.toThrow(/rate limited/);
  });
});

describe('catalogCostUsd', () => {
  const pricing = {
    inputPerMillion: 2,
    outputPerMillion: 8,
    cacheReadPerMillion: 0.5,
    inputTokenPricingTiers: [
      { thresholdTokens: 200_000, inputPerMillion: 4, outputPerMillion: 12 },
    ],
  };

  it('charges cached input at the cache rate', () => {
    expect(
      catalogCostUsd({ inputTokens: 100_000, cacheReadTokens: 40_000, outputTokens: 0 }, pricing),
    ).toBeCloseTo((60_000 * 2 + 40_000 * 0.5) / 1_000_000, 10);
  });

  it('applies the input tier the request crossed', () => {
    expect(catalogCostUsd({ inputTokens: 250_000, outputTokens: 1_000 }, pricing)).toBeCloseTo(
      (250_000 * 4 + 1_000 * 12) / 1_000_000,
      10,
    );
  });

  it('returns null for a route with no registry price', () => {
    expect(catalogCostUsd({ inputTokens: 1 }, {})).toBeNull();
  });
});

describe('providerResponder', () => {
  it('sends the built case request with the route model id to the adapter', async () => {
    const dataset = loadDataset('tools');
    const seen: ProviderChatRequest[] = [];
    const respond = providerResponder({
      adapter: {
        stream(request) {
          seen.push(request);
          return chunks([{ type: 'text-delta', delta: 'Paris' }]);
        },
      },
      providerModelId: 'provider-model',
      dataset,
      pricing: null,
      now: clock(0, 1, 2),
    });
    const evalCase = dataset.cases.find((entry) => entry.id === 'tools/use-tool-result')!;
    const response = await respond(evalCase);
    expect(response.text).toBe('Paris');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.model).toBe('provider-model');
    expect(seen[0]!.tools?.map((tool) => tool.name)).toEqual(['get_weather']);
    expect(seen[0]!.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  });
});
