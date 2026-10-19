import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { memorySummaryFingerprint, parseMemorySummary } from '../memory-summary-service';

describe('parseMemorySummary', () => {
  it('reads the two sections the model writes, dropping bullets and markdown', () => {
    const summary = parseMemorySummary(
      [
        'ABOUT:',
        '- You lead the mobile team at a fintech company.',
        '* You are migrating the app to **React Native**.',
        '',
        'PREFERENCES:',
        '1. You prefer short answers with code first.',
      ].join('\n'),
    );

    expect(summary).toEqual({
      about: [
        'You lead the mobile team at a fintech company.',
        'You are migrating the app to React Native.',
      ],
      preferences: ['You prefer short answers with code first.'],
    });
  });

  it('ignores preamble, repeats and anything past the cap', () => {
    const lines = Array.from({ length: 9 }, (_, index) => `You like item ${index}.`);
    const summary = parseMemorySummary(
      ['Here is the summary.', 'PREFERENCES', ...lines, 'You like item 0.'].join('\n'),
    );

    expect(summary.about).toEqual([]);
    expect(summary.preferences).toHaveLength(6);
    expect(summary.preferences[0]).toBe('You like item 0.');
  });
});

describe('memorySummaryFingerprint', () => {
  const memories = [
    { id: 'b', content: 'x', updatedAt: '2026-10-19T01:00:00Z' },
    { id: 'a', content: 'y', updatedAt: '2026-10-19T02:00:00Z' },
  ];

  it('does not depend on the order the memories were read in', () => {
    expect(memorySummaryFingerprint(memories, null)).toBe(
      memorySummaryFingerprint([...memories].reverse(), null),
    );
  });

  it('changes when a memory changes or the workspace differs', () => {
    const base = memorySummaryFingerprint(memories, null);
    expect(
      memorySummaryFingerprint(
        [{ ...memories[0]!, updatedAt: '2026-10-19T03:00:00Z' }, memories[1]!],
        null,
      ),
    ).not.toBe(base);
    expect(memorySummaryFingerprint(memories, 'org-1')).not.toBe(base);
  });
});
