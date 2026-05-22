/**
 * E2E integration test for cost-tracker reasoning + cached token handling.
 *
 * This test exists because both OpenAI APIs ship different cached-token shapes
 * and we discovered drift after R24: unit tests passed, but the integration
 * path between the provider response shape and recordModelUsage had not been
 * exercised end-to-end for both shapes.
 *
 * Data path exercised (non-streaming):
 *   OpenAIProvider.sendRequest (real, fetch mocked)
 *   → LLMProviderResponse
 *   → recordModelUsage (real, using same field mapping as response-builder.ts:122-128)
 *   → getModelUsageReport
 *   → toOtelAttributes
 *
 * Both OpenAI API shapes that ship cache + reasoning token counts:
 *   Chat Completions: completion_tokens_details.reasoning_tokens
 *                     prompt_tokens_details.cached_tokens
 *   Responses API:    output_tokens_details.reasoning_tokens
 *                     input_tokens_details.cached_tokens
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Use real cost-tracker (no mock) to test full data path.
// Pricing needs a model in the catalog; mock just enough to return a known price.
vi.mock('@agiworkforce/types', () => ({
  getModelMetadataById: vi.fn((id: string) => {
    if (id === 'gpt-5.5')
      return {
        inputCost: 5.0,
        outputCost: 30.0,
        provider: 'openai',
        capabilities: { thinking: false },
      };
    return null;
  }),
  normalizeModelId: vi.fn((id: string) => id),
}));

import { OpenAIProvider } from '@/lib/llm-providers/openai';
import {
  recordModelUsage,
  getModelUsageReport,
  toOtelAttributes,
  resetAllSessions,
} from '@/lib/cost-tracker';

// Mirrors the field mapping used by response-builder.ts:122-128 so this test
// stays honest about the production wiring.
function recordFromProviderResponse(
  sessionId: string,
  r: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    reasoningOutputTokens?: number;
    cachedInputTokens?: number;
    cacheCreationInputTokens?: number;
  },
) {
  recordModelUsage(sessionId, r.model, {
    inputTokens: r.promptTokens,
    outputTokens: r.completionTokens,
    reasoningOutputTokens: r.reasoningOutputTokens,
    cacheReadInputTokens: r.cachedInputTokens,
    cacheCreationInputTokens: r.cacheCreationInputTokens,
  });
}

/** Build a minimal OpenAI-format JSON response body. */
function makeCompletionsBody(usageOverrides: Record<string, unknown>) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    model: 'gpt-5.5',
    choices: [
      { index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' },
    ],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
      ...usageOverrides,
    },
  };
}

function mockFetchOnce(body: unknown) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const SESSION_CHAT = 'e2e-session-chat-completions';
const SESSION_RESPONSES = 'e2e-session-responses-api';

beforeEach(() => {
  resetAllSessions();
  vi.restoreAllMocks();
});

describe('cost-tracker E2E — both OpenAI API shapes produce identical usage records', () => {
  it('Chat Completions shape: extracts reasoning + cached tokens and records them correctly', async () => {
    const provider = new OpenAIProvider('test-api-key');

    mockFetchOnce(
      makeCompletionsBody({
        completion_tokens_details: { reasoning_tokens: 1500 },
        prompt_tokens_details: { cached_tokens: 500 },
      }),
    );

    const response = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'Test prompt that is long enough' }],
    });

    expect(response.reasoningOutputTokens).toBe(1500);
    expect(response.cachedInputTokens).toBe(500);

    recordFromProviderResponse(SESSION_CHAT, response);

    const report = getModelUsageReport(SESSION_CHAT);
    const usage = report.get('gpt-5.5');
    expect(usage).toBeDefined();
    expect(usage!.reasoningOutputTokens).toBe(1500);
    expect(usage!.cacheReadInputTokens).toBe(500);
    expect(usage!.cacheCreationInputTokens).toBe(0); // OpenAI doesn't expose this
  });

  it('Responses API shape: extracts reasoning + cached tokens and records them correctly', async () => {
    const provider = new OpenAIProvider('test-api-key');

    mockFetchOnce(
      makeCompletionsBody({
        output_tokens_details: { reasoning_tokens: 1500 },
        input_tokens_details: { cached_tokens: 500 },
      }),
    );

    const response = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'Test prompt that is long enough' }],
    });

    expect(response.reasoningOutputTokens).toBe(1500);
    expect(response.cachedInputTokens).toBe(500);

    recordFromProviderResponse(SESSION_RESPONSES, response);

    const report = getModelUsageReport(SESSION_RESPONSES);
    const usage = report.get('gpt-5.5');
    expect(usage).toBeDefined();
    expect(usage!.reasoningOutputTokens).toBe(1500);
    expect(usage!.cacheReadInputTokens).toBe(500);
    expect(usage!.cacheCreationInputTokens).toBe(0);
  });

  it('both shapes produce identical ModelUsage records', async () => {
    const provider = new OpenAIProvider('test-api-key');

    // Chat Completions shape
    mockFetchOnce(
      makeCompletionsBody({
        completion_tokens_details: { reasoning_tokens: 1500 },
        prompt_tokens_details: { cached_tokens: 500 },
      }),
    );
    const chatResp = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'x' }],
    });
    recordFromProviderResponse(SESSION_CHAT, chatResp);

    // Responses API shape
    mockFetchOnce(
      makeCompletionsBody({
        output_tokens_details: { reasoning_tokens: 1500 },
        input_tokens_details: { cached_tokens: 500 },
      }),
    );
    const responsesResp = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'x' }],
    });
    recordFromProviderResponse(SESSION_RESPONSES, responsesResp);

    const chatUsage = getModelUsageReport(SESSION_CHAT).get('gpt-5.5')!;
    const responsesUsage = getModelUsageReport(SESSION_RESPONSES).get('gpt-5.5')!;

    expect(chatUsage.inputTokens).toBe(responsesUsage.inputTokens);
    expect(chatUsage.outputTokens).toBe(responsesUsage.outputTokens);
    expect(chatUsage.reasoningOutputTokens).toBe(responsesUsage.reasoningOutputTokens);
    expect(chatUsage.cacheReadInputTokens).toBe(responsesUsage.cacheReadInputTokens);
    expect(chatUsage.cacheCreationInputTokens).toBe(responsesUsage.cacheCreationInputTokens);
    expect(chatUsage.costUsd).toBeCloseTo(responsesUsage.costUsd, 8);
  });

  it('OTEL: gen_ai.usage.cache_read.input_tokens is emitted with value 500 for both shapes', async () => {
    const provider = new OpenAIProvider('test-api-key');

    for (const usageOverrides of [
      {
        completion_tokens_details: { reasoning_tokens: 1500 },
        prompt_tokens_details: { cached_tokens: 500 },
      },
      {
        output_tokens_details: { reasoning_tokens: 1500 },
        input_tokens_details: { cached_tokens: 500 },
      },
    ]) {
      mockFetchOnce(makeCompletionsBody(usageOverrides));
      const resp = await provider.sendRequest({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'x' }],
      });

      const attrs = toOtelAttributes('openai', resp.model ?? 'gpt-5.5', {
        inputTokens: resp.promptTokens,
        outputTokens: resp.completionTokens,
        reasoningOutputTokens: resp.reasoningOutputTokens,
        cacheReadInputTokens: resp.cachedInputTokens,
        cacheCreationInputTokens: resp.cacheCreationInputTokens,
      });

      expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBe(500);
      expect(attrs['codex.usage.reasoning_output_tokens']).toBe(1500);
    }
  });

  it('OTEL: reasoning tokens billed at output rate — cost increases by reasoning * outputCost/M', async () => {
    const provider = new OpenAIProvider('test-api-key');

    // Baseline: no reasoning tokens
    mockFetchOnce(makeCompletionsBody({}));
    const baseResp = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'x' }],
    });
    recordFromProviderResponse('session-base', baseResp);

    // With reasoning tokens
    mockFetchOnce(
      makeCompletionsBody({ completion_tokens_details: { reasoning_tokens: 1_000_000 } }),
    );
    const reasoningResp = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'x' }],
    });
    recordFromProviderResponse('session-reasoning', reasoningResp);

    const baseCost = getModelUsageReport('session-base').get('gpt-5.5')!.costUsd;
    const reasoningCost = getModelUsageReport('session-reasoning').get('gpt-5.5')!.costUsd;

    // gpt-5.5: outputCost=$30/M → 1M reasoning = $30 extra
    expect(reasoningCost - baseCost).toBeCloseTo(30.0, 4);
  });

  it('edge case: reasoning_tokens=0 (field absent) does not emit codex.usage.reasoning_output_tokens', async () => {
    const provider = new OpenAIProvider('test-api-key');

    mockFetchOnce(makeCompletionsBody({})); // no reasoning_tokens field
    const resp = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'x' }],
    });

    expect(resp.reasoningOutputTokens).toBeUndefined();

    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: resp.promptTokens,
      outputTokens: resp.completionTokens,
      reasoningOutputTokens: resp.reasoningOutputTokens,
      cacheReadInputTokens: resp.cachedInputTokens,
    });

    // Absent reasoning must NOT emit a zero-valued attribute (avoid false signal)
    expect(attrs['codex.usage.reasoning_output_tokens']).toBeUndefined();
  });

  it('edge case: cached_tokens=0 (field absent) does not emit gen_ai.usage.cache_read.input_tokens', async () => {
    const provider = new OpenAIProvider('test-api-key');

    mockFetchOnce(makeCompletionsBody({})); // no cached_tokens field
    const resp = await provider.sendRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'x' }],
    });

    expect(resp.cachedInputTokens).toBeUndefined();

    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: resp.promptTokens,
      outputTokens: resp.completionTokens,
      cacheReadInputTokens: resp.cachedInputTokens,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBeUndefined();
  });
});
