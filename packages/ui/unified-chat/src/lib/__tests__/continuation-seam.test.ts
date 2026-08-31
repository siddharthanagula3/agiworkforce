import { describe, expect, it } from 'vitest';

import { repairContinuationSeam } from '../continuation-seam';

describe('repairContinuationSeam', () => {
  it('resumes a word that was cut in half', () => {
    expect(repairContinuationSeam('the answer is impor', 'tant to get right')).toBe(
      'tant to get right',
    );
  });

  it('separates a new sentence that ran into the previous word', () => {
    // The audit's seam: the response ended on a complete word and the
    // continuation began a new sentence with no space between them.
    expect(repairContinuationSeam('and that completes the process', 'The next step')).toBe(
      ' The next step',
    );
  });

  it('separates a new sentence that ran into a full stop', () => {
    expect(repairContinuationSeam('and that completes it.', 'Next we look at')).toBe(
      ' Next we look at',
    );
  });

  it('drops a tail the model repeated verbatim', () => {
    const seed = 'Recursion works by breaking the problem into smaller pieces';
    expect(repairContinuationSeam(seed, 'into smaller pieces until a base case is reached')).toBe(
      ' until a base case is reached',
    );
  });

  it('leaves a short repeat alone rather than guessing it was a repeat', () => {
    // Three characters is as likely to be a resumed word as a duplicated one,
    // and deleting text we were sent is the worse of the two mistakes.
    expect(repairContinuationSeam('a list of the', 'the value')).toBe('the value');
  });

  it('leaves an identifier inside a fenced block fused', () => {
    const seed = ['Here is the code:', '', '```ts', 'const total = order'].join('\n');
    expect(repairContinuationSeam(seed, 'Total + tax;')).toBe('Total + tax;');
  });

  it('leaves an identifier inside an inline span fused', () => {
    expect(repairContinuationSeam('call `render', 'Widget` next')).toBe('Widget` next');
  });

  it('treats a closed fence as prose again', () => {
    const seed = ['```ts', 'const a = 1;', '```', '', 'That covers the setup'].join('\n');
    expect(repairContinuationSeam(seed, 'Next comes the')).toBe(' Next comes the');
  });

  it('never inserts where either side already supplies whitespace', () => {
    expect(repairContinuationSeam('the process ', 'The next step')).toBe('The next step');
    expect(repairContinuationSeam('the process', ' The next step')).toBe(' The next step');
    expect(repairContinuationSeam('the process', '\n\nThe next step')).toBe('\n\nThe next step');
  });

  it('leaves punctuation joins alone', () => {
    expect(repairContinuationSeam('call foo()', '.bar()')).toBe('.bar()');
    expect(repairContinuationSeam('the value', ', which is')).toBe(', which is');
  });

  it('passes empty input through untouched', () => {
    expect(repairContinuationSeam('', 'anything')).toBe('anything');
    expect(repairContinuationSeam('anything', '')).toBe('');
  });

  it('returns nothing when the continuation only repeats what we already have', () => {
    expect(repairContinuationSeam('breaking the problem down', 'the problem down')).toBe('');
  });
});
