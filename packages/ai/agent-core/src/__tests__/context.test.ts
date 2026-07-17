import { describe, expect, it, vi } from 'vitest';

import {
  compactContext,
  computeContextBudget,
  estimateTextTokens,
  type AgentContextMessage,
  type ContextUsageAnchor,
} from '../index';

function message(
  id: string,
  role: AgentContextMessage['role'],
  content: string,
  kind: AgentContextMessage['kind'] = 'text',
): AgentContextMessage {
  return { id, role, content, kind };
}

describe('shared context accounting', () => {
  it('uses provider-observed usage to calibrate future estimates', () => {
    const messages = [
      message('system', 'system', 's'.repeat(100)),
      message('u1', 'user', 'x'.repeat(300)),
    ];
    const rawEstimate = messages.reduce(
      (sum, item) => sum + estimateTextTokens(item.content) + 4,
      0,
    );
    const anchor: ContextUsageAnchor = {
      observedInputTokens: rawEstimate * 2,
      estimatedTokensAtObservation: rawEstimate,
    };

    const budget = computeContextBudget({
      contextWindowTokens: 1_000,
      messages,
      usageAnchor: anchor,
    });

    expect(budget.usedTokens).toBe(rawEstimate * 2);
    expect(budget.accounting).toBe('provider_anchored');
  });

  it('reserves output capacity before deriving warning and compaction thresholds', () => {
    const budget = computeContextBudget({
      contextWindowTokens: 10_000,
      reservedOutputTokens: 2_000,
      messages: [],
    });

    expect(budget.usableInputTokens).toBe(8_000);
    expect(budget.warningTokens).toBe(5_600);
    expect(budget.compactionTokens).toBe(6_400);
    expect(budget.targetTokens).toBe(5_200);
  });
});

describe('shared five-stage compaction reducer', () => {
  it('summarizes only the old prefix, labels it untrusted, and preserves the recent boundary', async () => {
    const summarize = vi.fn(async () => 'Decision: keep the local trust boundary.');
    const messages = [
      message('system', 'system', 'trusted system policy'),
      message('u1', 'user', 'old request '.repeat(160)),
      message('a1', 'assistant', 'old answer '.repeat(160)),
      message('tool1', 'tool', 'untrusted web output '.repeat(240), 'tool_result'),
      message('u2', 'user', 'recent request'),
      message('a2', 'assistant', 'recent answer'),
    ];

    const result = await compactContext({
      contextWindowTokens: 900,
      reservedOutputTokens: 100,
      messages,
      preserveRecentMessages: 2,
      summarize,
    });

    expect(result.compacted).toBe(true);
    expect(summarize).toHaveBeenCalledOnce();
    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages.at(-2)).toEqual(messages.at(-2));
    expect(result.messages.at(-1)).toEqual(messages.at(-1));
    expect(result.messages[1]?.kind).toBe('summary');
    expect(result.messages[1]?.role).toBe('assistant');
    expect(result.messages[1]?.content).toContain('UNTRUSTED HISTORICAL SUMMARY');
    expect(result.messages[1]?.content).toContain('keep the local trust boundary');
    expect(result.stages).toEqual([
      'account',
      'prune_tool_outputs',
      'split_history',
      'summarize_prefix',
      'fit_target',
    ]);
  });

  it('falls back deterministically when the summarizer fails', async () => {
    const result = await compactContext({
      contextWindowTokens: 700,
      reservedOutputTokens: 100,
      messages: [
        message('system', 'system', 'policy'),
        message('u1', 'user', 'first '.repeat(220)),
        message('a1', 'assistant', 'second '.repeat(220)),
        message('u2', 'user', 'latest'),
      ],
      preserveRecentMessages: 1,
      summarize: async () => {
        throw new Error('offline');
      },
    });

    expect(result.compacted).toBe(true);
    expect(result.summarySource).toBe('deterministic_fallback');
    expect(result.messages.at(-1)?.id).toBe('u2');
    expect(result.after.usedTokens).toBeLessThan(result.before.usedTokens);
  });
});
