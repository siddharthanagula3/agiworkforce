import { describe, expect, it } from 'vitest';

import type {
  CollectedProviderLine,
  ToolLoopProviderStepResult,
  ToolLoopToolResult,
} from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import {
  parseCloudAgentProviderStepResult,
  parseCloudAgentToolResult,
} from './cloud-agent-workflow';

/**
 * The durable workflow's `providerExecutor` and `toolExecutor` validate every
 * completed step against a `.strict()` Zod schema before it can reach the
 * tool loop. Those schemas are hand-copied shapes of `ToolLoopProviderStepResult`
 * and `ToolLoopToolResult` (tool-loop.ts) -- see schema-key-guard.ts for the
 * compile-time guard that keeps them in sync. This file is the runtime half:
 * it builds the producer's FULL shape and proves the schema still parses it.
 *
 * `accumulateObservedProviderUsage` (managed-usage-accounting-service.ts)
 * always attaches `routeId` and `costSource` to a `providerCallObservations`
 * entry once a pricing context is supplied, and conditionally attaches
 * `upstreamProvider` / `providerReportedCostUsd`; a schema that did not list
 * all four rejected every completed step with a ZodError, which the durable
 * operation executor collapsed into a generic message the client rendered as
 * "No response was returned" -- for any provider, since pricing is attached
 * on every completed step.
 */
function fullLine(): Required<CollectedProviderLine> {
  return {
    line: 'data: {"choices":[{"delta":{"content":"hi"}}]}\n',
    publicTextDelta: 'hi',
    reasoningDelta: 'hi',
    serverToolStart: { toolCallId: 'call-1', name: 'web_search' },
    serverToolResults: [
      {
        toolCallId: 'call-1',
        name: 'web_search',
        sources: [{ url: 'https://example.com', title: 'Example', snippet: 'a snippet' }],
        elapsedMs: 42,
      },
    ],
    searchActivity: false,
  };
}

function fullStepResult(): Required<ToolLoopProviderStepResult> {
  return {
    lines: [fullLine()],
    finishReason: 'end_turn',
    pendingToolCalls: [{ id: 'call-1', qualifiedName: 'web_search', args: { query: 'weather' } }],
    textContent: 'The answer is here.',
    publicTextTail: 'here.',
    generatedFileRefs: [
      { provider: 'google', filename: 'chart.png', containerId: 'c1', fileId: 'f1' },
    ],
    thinkingBlocks: [{ type: 'thinking', thinking: 'reasoning...', signature: 'sig' }],
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
          model: 'fixture-flash-model',
          costDollars: 0.002,
          costSource: 'estimated',
          routeId: 'google/fixture-flash-model',
          upstreamProvider: 'anthropic',
          providerReportedCostUsd: 0.0019,
        },
      ],
    },
  };
}

describe('parseCloudAgentProviderStepResult', () => {
  it('accepts the full shape ToolLoopProviderStepResult actually returns', () => {
    expect(() => parseCloudAgentProviderStepResult(fullStepResult())).not.toThrow();
  });

  it('rejects a routeId that is neither a string nor null', () => {
    const result = fullStepResult();
    const observation = result.usage.providerCallObservations?.[0];
    if (!observation) throw new Error('fixture missing observation');
    Object.assign(observation, { routeId: 42 });
    expect(() => parseCloudAgentProviderStepResult(result)).toThrow();
  });
});

describe('parseCloudAgentToolResult', () => {
  function fullToolResult(): Required<Omit<ToolLoopToolResult, 'interactiveCard'>> {
    return {
      content: 'done',
      isError: false,
      unavailable: false,
      source: { url: 'https://example.com', title: 'Example', snippet: 'a snippet' },
      sources: [{ url: 'https://example.com', title: 'Example', snippet: 'a snippet' }],
      pngResults: ['base64data'],
      generatedFiles: [
        {
          id: 'file-1',
          file_name: 'chart.png',
          mime_type: 'image/png',
          uri: '/files/chart.png',
          byte_count: 1024,
          kind: 'artifact',
          checksum_sha256: 'a'.repeat(64),
          surface: 'artifact',
          previewable: true,
        },
      ],
      inputRequired: { inputRequests: { field: 'value' }, requestState: 'pending' },
    };
  }

  it('accepts the full shape ToolLoopToolResult actually returns, including generated files', () => {
    expect(() => parseCloudAgentToolResult(fullToolResult())).not.toThrow();
  });

  it('rejects a generated file missing the fields the persistence layer always sets', () => {
    const result = fullToolResult();
    const file = result.generatedFiles[0];
    if (!file) throw new Error('fixture missing generated file');
    const { checksum_sha256: _checksum, ...withoutChecksum } = file;
    result.generatedFiles = [withoutChecksum as typeof file];
    expect(() => parseCloudAgentToolResult(result)).toThrow();
  });
});
