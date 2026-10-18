import { describe, expect, it } from 'vitest';

import {
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
