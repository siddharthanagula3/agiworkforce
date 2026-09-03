import { describe, expect, it } from 'vitest';

import { mergeAdjacentThinkingSegments, type ThinkingSegmentLike } from './mergeThinkingSegments';

function segment(overrides: Partial<ThinkingSegmentLike> & { id: string }): ThinkingSegmentLike {
  return {
    content: '',
    isStreaming: false,
    startedAt: '2026-09-02T00:00:00.000Z',
    completedAt: '2026-09-02T00:00:01.000Z',
    ...overrides,
  };
}

describe('mergeAdjacentThinkingSegments', () => {
  it('merges two adjacent thinking deltas into one block', () => {
    const segments = [
      segment({ id: 'a', content: 'first', durationSeconds: 1 }),
      segment({ id: 'b', content: 'second', durationSeconds: 2 }),
    ];

    const groups = mergeAdjacentThinkingSegments(segments, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.segment.content).toBe('first\n\nsecond');
    expect(groups[0]?.segment.durationSeconds).toBe(3);
  });

  it('keeps segments separate when a tool row renders between them', () => {
    const segments = [
      segment({ id: 'a', content: 'first' }),
      segment({ id: 'b', content: 'second' }),
    ];
    const tools = [{ id: 'search-1', name: 'web_search' }];

    const groups = mergeAdjacentThinkingSegments(segments, tools);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.segment.content).toBe('first');
    expect(groups[0]?.toolAfter).toEqual(tools[0]);
    expect(groups[1]?.segment.content).toBe('second');
    expect(groups[1]?.toolAfter).toBeUndefined();
  });

  it('merges three consecutive segments in order', () => {
    const segments = [
      segment({ id: 'a', content: 'one', durationSeconds: 1 }),
      segment({ id: 'b', content: 'two', durationSeconds: 1 }),
      segment({ id: 'c', content: 'three', durationSeconds: 1 }),
    ];

    const groups = mergeAdjacentThinkingSegments(segments, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.segment.content).toBe('one\n\ntwo\n\nthree');
    expect(groups[0]?.segment.durationSeconds).toBe(3);
  });

  it('keeps a still-streaming second segment merged with an undefined summed duration', () => {
    const segments = [
      segment({ id: 'a', content: 'first', durationSeconds: 1 }),
      segment({
        id: 'b',
        content: 'second',
        isStreaming: true,
        completedAt: null,
        durationSeconds: undefined,
      }),
    ];

    const groups = mergeAdjacentThinkingSegments(segments, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.segment.isStreaming).toBe(true);
    expect(groups[0]?.segment.completedAt).toBeNull();
    expect(groups[0]?.segment.durationSeconds).toBeUndefined();
  });

  it('leaves a single segment untouched', () => {
    const segments = [segment({ id: 'a', content: 'only' })];

    const groups = mergeAdjacentThinkingSegments(segments, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.segment).toEqual(segments[0]);
  });

  it('returns nothing for an empty segment list', () => {
    expect(mergeAdjacentThinkingSegments([], [])).toEqual([]);
  });
});
