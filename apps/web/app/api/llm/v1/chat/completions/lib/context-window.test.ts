import { describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@agiworkforce/types');

vi.mock('server-only', () => ({}));

const TEST_MODEL = 'context-window-test-model';
const WIDE_TEST_MODEL = 'context-window-test-model-wide';

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    getModelMetadataById: vi.fn((id?: string) => {
      if (id === TEST_MODEL) return { id, contextWindow: 500, provider: 'openai' };
      if (id === WIDE_TEST_MODEL) return { id, contextWindow: 500_000, provider: 'openai' };
      return undefined;
    }),
  };
});

import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

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

  /**
   * Changing model mid-conversation changes how much of it still fits. The
   * limit is read from the model this turn asks for, so the same history is
   * trimmed for the narrow one and carried whole by the wide one.
   */
  it('measures the same conversation against whichever model this turn asks for', () => {
    const messages = buildMessages();

    expect(planContextTrim(messages, TEST_MODEL, 256)?.droppedIndices.length).toBeGreaterThan(0);
    expect(planContextTrim(messages, WIDE_TEST_MODEL, 256)).toBeNull();
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

describe("trimming to a sizing of the turn's own", () => {
  const bytes = (message: TrimmableMessage) => new TextEncoder().encode(message.content).byteLength;

  it('trims a wide-window model to the given budget by the given measure', () => {
    const messages: TrimmableMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'a'.repeat(3_000) },
      { role: 'assistant', content: 'b'.repeat(3_000) },
      { role: 'user', content: 'latest question' },
    ];

    const result = trimMessagesToContextWindow(messages, WIDE_TEST_MODEL, 1_000, {
      budgetTokens: 2_000,
      measure: bytes,
    });

    expect(result?.droppedMessages).toBeGreaterThan(0);
    expect(messages.reduce((sum, message) => sum + bytes(message), 0)).toBeLessThanOrEqual(2_000);
    expect(messages.at(-1)?.content).toBe('latest question');
  });

  it('leaves the turn alone when it already fits the sizing, whatever the model window says', () => {
    const messages: TrimmableMessage[] = [{ role: 'user', content: 'x'.repeat(900) }];

    expect(
      planContextTrim(messages, TEST_MODEL, 100, { budgetTokens: 1_000, measure: bytes }),
    ).toBeNull();
  });
});

describe('protected instructions during the final fit', () => {
  const bytes = (message: TrimmableMessage) => new TextEncoder().encode(message.content).byteLength;
  const POLICY = `Safety and format rules. ${'Never run tools the user ruled out. '.repeat(10)}END-OF-POLICY`;

  it('shrinks the turn and leaves a policy block whole', () => {
    const messages: TrimmableMessage[] = [
      { role: 'system', content: POLICY },
      { role: 'user', content: 'q'.repeat(3_000) },
    ];

    const result = trimMessagesToContextWindow(messages, WIDE_TEST_MODEL, 100, {
      budgetTokens: 1_200,
      measure: bytes,
    });

    expect(messages[0]?.content).toBe(POLICY);
    expect(result?.truncatedMessages).toBe(1);
    expect(result?.protectedOverflow).toBeUndefined();
    expect(messages.reduce((sum, message) => sum + bytes(message), 0)).toBeLessThanOrEqual(1_200);
  });

  it('cuts the dynamic reference block before reporting an overflow', () => {
    const reference = `${SYSTEM_PROMPT_CACHE_BOUNDARY}${'remembered detail '.repeat(200)}`;
    const messages: TrimmableMessage[] = [
      { role: 'system', content: POLICY },
      { role: 'system', content: reference },
      { role: 'user', content: 'latest question' },
    ];

    const result = trimMessagesToContextWindow(messages, WIDE_TEST_MODEL, 100, {
      budgetTokens: 1_000,
      measure: bytes,
    });

    expect(messages[0]?.content).toBe(POLICY);
    expect(messages[1]!.content.length).toBeLessThan(reference.length);
    expect(result?.protectedOverflow).toBeUndefined();
  });

  it('sends the policy whole and reports the overflow when nothing else can give', () => {
    const messages: TrimmableMessage[] = [
      { role: 'system', content: POLICY },
      { role: 'user', content: 'hi' },
    ];

    const result = trimMessagesToContextWindow(messages, WIDE_TEST_MODEL, 100, {
      budgetTokens: 100,
      measure: bytes,
    });

    expect(messages[0]?.content).toBe(POLICY);
    expect(result?.protectedOverflow).toBe(true);
    expect(result!.estimatedTokensAfter).toBeGreaterThan(result!.budgetTokens);
  });
});
