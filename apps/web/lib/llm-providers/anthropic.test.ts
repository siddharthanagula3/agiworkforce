import { describe, expect, it } from 'vitest';

import { mapMessagesToAnthropic } from './anthropic';

// Regression guard for CTX-003 / AGI-DOC-0018 BK-11.01 (AC-19 — context
// assembly MUST be deterministic). Tool_use fallback ids must not depend on the
// wall clock: identical inputs must map to identical Anthropic request bodies.
describe('mapMessagesToAnthropic — deterministic tool_use ids (AC-19)', () => {
  const messages = [
    {
      role: 'assistant',
      content: '',
      // Two tool calls with NO upstream id → fallback id path.
      tool_calls: [
        { function: { name: 'search', arguments: '{"q":"a"}' } },
        { function: { name: 'fetch', arguments: '{"u":"b"}' } },
      ],
    },
  ];

  const toolUseIds = (out: Array<Record<string, unknown>>): Array<string | undefined> =>
    (out[0]?.['content'] as Array<{ type: string; id?: string }>)
      .filter((b) => b.type === 'tool_use')
      .map((b) => b.id);

  it('derives stable position-based ids when upstream ids are absent', () => {
    expect(toolUseIds(mapMessagesToAnthropic(messages))).toEqual(['call_0_0', 'call_0_1']);
  });

  it('produces byte-identical output across repeated calls (no wall-clock dependence)', () => {
    const first = JSON.stringify(mapMessagesToAnthropic(messages));
    const second = JSON.stringify(mapMessagesToAnthropic(messages));
    expect(first).toEqual(second);
  });

  it('preserves an upstream-provided id verbatim', () => {
    const withId = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'toolu_provided', function: { name: 'search', arguments: '{}' } }],
      },
    ];
    expect(toolUseIds(mapMessagesToAnthropic(withId))).toEqual(['toolu_provided']);
  });
});
