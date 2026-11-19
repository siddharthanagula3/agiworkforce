import { describe, expect, it } from 'vitest';
import { buildChangeReview, resolveReview } from '../index';

describe('change review', () => {
  it('splits an edit into numbered changes that undo one at a time', () => {
    const previous = 'The quick brown fox jumps over the lazy dog.';
    const next = 'The quick red fox jumps over the sleepy dog.';
    const review = buildChangeReview(previous, next);
    expect(review?.changeCount).toBe(2);
    expect(resolveReview(review!, new Set())).toBe(next);
    expect(resolveReview(review!, null)).toBe(previous);
    expect(resolveReview(review!, new Set([0]))).toBe(
      'The quick brown fox jumps over the sleepy dog.',
    );
    expect(resolveReview(review!, new Set([1]))).toBe('The quick red fox jumps over the lazy dog.');
  });

  it('reports no changes for identical text', () => {
    expect(buildChangeReview('Same words.', 'Same words.')?.changeCount).toBe(0);
  });
});
