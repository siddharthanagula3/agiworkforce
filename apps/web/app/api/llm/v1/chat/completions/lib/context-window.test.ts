import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TEST_MODEL = 'context-window-test-model';

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    getModelMetadataById: vi.fn((id?: string) =>
      id === TEST_MODEL ? { id: TEST_MODEL, contextWindow: 500, provider: 'openai' } : undefined,
    ),
  };
});

import {
  applyDroppedSpanReplacement,
  DROPPED_HISTORY_MARKER,
  planContextTrim,
  trimMessagesToContextWindow,
  type TrimmableMessage,
} from './context-window';

function buildMessages(): TrimmableMessage[] {
  const filler = (label: string) => `${label} `.repeat(400);
  return [
    { role: 'system', content: 'stay on task' },
    { role: 'user', content: filler('first-question') },
    { role: 'assistant', content: filler('first-answer') },
    { role: 'user', content: filler('second-question') },
    { role: 'assistant', content: filler('second-answer') },
    { role: 'user', content: 'final question, keep this' },
  ];
}

describe('planContextTrim', () => {
  it('returns null for an unknown model', () => {
    expect(planContextTrim(buildMessages(), 'unknown-model', 256)).toBeNull();
  });

  it('returns null when the conversation already fits the budget', () => {
    const messages: TrimmableMessage[] = [{ role: 'user', content: 'hi' }];
    expect(planContextTrim(messages, TEST_MODEL, 256)).toBeNull();
  });

  it('drops oldest-first, never touching the last user turn', () => {
    const messages = buildMessages();
    const plan = planContextTrim(messages, TEST_MODEL, 256);

    expect(plan).not.toBeNull();
    expect(plan!.droppedIndices.length).toBeGreaterThan(0);
    expect(plan!.droppedIndices).toEqual([...plan!.droppedIndices].sort((a, b) => a - b));
    expect(plan!.droppedIndices).not.toContain(messages.length - 1);
    expect(plan!.droppedIndices.every((index) => index < messages.length - 1)).toBe(true);
  });

  it('keeps a tool message attached to the group it trails', () => {
    const messages: TrimmableMessage[] = [
      { role: 'user', content: 'old question '.repeat(400) },
      { role: 'assistant', content: 'old answer '.repeat(400), tool_calls: [{ id: 't1' }] },
      { role: 'tool', content: 'old tool result '.repeat(200), tool_call_id: 't1' },
      { role: 'user', content: 'final question, keep this' },
    ];
    const plan = planContextTrim(messages, TEST_MODEL, 256);

    expect(plan).not.toBeNull();
    if (plan!.droppedIndices.includes(2)) {
      expect(plan!.droppedIndices).toContain(1);
    }
  });
});

describe('applyDroppedSpanReplacement', () => {
  it('inserts the replacement after leading system messages only when something was dropped', () => {
    const messages = buildMessages();
    const plan = planContextTrim(messages, TEST_MODEL, 256)!;

    const result = applyDroppedSpanReplacement(messages, plan, 'a custom summary', TEST_MODEL);

    expect(result.droppedMessages).toBe(plan.droppedIndices.length);
    expect(messages[0]).toEqual({ role: 'system', content: 'stay on task' });
    expect(messages[1]).toEqual({ role: 'system', content: 'a custom summary' });
    expect(result.estimatedTokensAfter).toBeLessThanOrEqual(result.budgetTokens);
  });

  it('inserts nothing when replacementText is null, even if messages were dropped', () => {
    const messages = buildMessages();
    const plan = planContextTrim(messages, TEST_MODEL, 256)!;
    const beforeLength = messages.length - plan.droppedIndices.length;

    applyDroppedSpanReplacement(messages, plan, null, TEST_MODEL);

    expect(messages.length).toBe(beforeLength);
    expect(messages.some((message) => message.content === DROPPED_HISTORY_MARKER)).toBe(false);
  });
});

describe('trimMessagesToContextWindow', () => {
  it('matches planContextTrim + applyDroppedSpanReplacement(DROPPED_HISTORY_MARKER)', () => {
    const messages = buildMessages();
    const plan = planContextTrim(buildMessages(), TEST_MODEL, 256)!;
    const expected = applyDroppedSpanReplacement(
      buildMessages(),
      plan,
      DROPPED_HISTORY_MARKER,
      TEST_MODEL,
    );

    const result = trimMessagesToContextWindow(messages, TEST_MODEL, 256);

    expect(result).toEqual(expected);
    expect(messages.some((message) => message.content === DROPPED_HISTORY_MARKER)).toBe(true);
  });
});
