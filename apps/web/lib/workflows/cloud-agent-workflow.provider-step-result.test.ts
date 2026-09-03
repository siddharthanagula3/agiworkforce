import { describe, expect, it } from 'vitest';

import { parseCloudAgentProviderStepResult } from './cloud-agent-workflow';

/**
 * The durable workflow's `providerExecutor` validates every completed
 * provider step against this schema before it can reach the tool loop.
 * `accumulateObservedProviderUsage` (managed-usage-accounting-service.ts)
 * always attaches `routeId` and `costSource` to a `providerCallObservations`
 * entry once a pricing context is supplied, and conditionally attaches
 * `upstreamProvider` / `providerReportedCostUsd`. A `.strict()` schema that
 * does not list all four rejects every such step with a ZodError, which the
 * durable operation executor then collapses into a generic message and the
 * client renders as "No response was returned" -- for any provider, since
 * pricing is attached on every completed step.
 */
interface ProviderCallObservationFixture {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
  provider: string;
  model: string;
  costDollars: number;
  costSource: string;
  routeId: string | number;
  upstreamProvider?: string;
  providerReportedCostUsd?: number;
}

interface ProviderStepResultFixture {
  finishReason: string;
  pendingToolCalls: unknown[];
  textContent: string;
  publicTextTail: string;
  generatedFileRefs: unknown[];
  thinkingBlocks: unknown[];
  canonicalText: string;
  usage: {
    providerCalls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cacheWrite1hTokens: number;
    reasoningTokens: number;
    providerCostDollars: number;
    providerCallObservations: ProviderCallObservationFixture[];
  };
}

function baseResult(): ProviderStepResultFixture {
  return {
    finishReason: 'end_turn',
    pendingToolCalls: [],
    textContent: 'The answer is here.',
    publicTextTail: '',
    generatedFileRefs: [],
    thinkingBlocks: [],
    canonicalText: 'The answer is here.',
    usage: {
      providerCalls: 1,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
      providerCostDollars: 0.002,
      providerCallObservations: [
        {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
          reasoningTokens: 0,
          provider: 'google',
          model: 'gemini-3.8-flash',
          costDollars: 0.002,
          costSource: 'estimated',
          routeId: 'google/gemini-3.8-flash',
        },
      ],
    },
  };
}

describe('parseCloudAgentProviderStepResult', () => {
  it('accepts a completed step whose observation carries routeId and costSource', () => {
    expect(() => parseCloudAgentProviderStepResult(baseResult())).not.toThrow();
  });

  it('accepts an observation that also carries upstreamProvider and providerReportedCostUsd', () => {
    const result = baseResult();
    const observation = result.usage.providerCallObservations?.[0];
    if (!observation) throw new Error('fixture missing observation');
    Object.assign(observation, {
      upstreamProvider: 'anthropic',
      providerReportedCostUsd: 0.0019,
    });
    expect(() => parseCloudAgentProviderStepResult(result)).not.toThrow();
  });

  it('rejects a routeId that is neither a string nor null', () => {
    const result = baseResult();
    const observation = result.usage.providerCallObservations?.[0];
    if (!observation) throw new Error('fixture missing observation');
    Object.assign(observation, { routeId: 42 });
    expect(() => parseCloudAgentProviderStepResult(result)).toThrow();
  });
});
