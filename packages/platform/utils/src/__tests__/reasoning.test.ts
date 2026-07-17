import { describe, it, expect } from 'vitest';
import { deriveReasoningPhrase, formatThinkingDuration } from '../reasoning';

describe('deriveReasoningPhrase', () => {
  it('returns Thinking for empty content', () => {
    expect(deriveReasoningPhrase('')).toBe('Thinking');
    expect(deriveReasoningPhrase('   \n  ')).toBe('Thinking');
  });

  it('returns Thinking for unrecognized content', () => {
    expect(deriveReasoningPhrase('the quick brown fox')).toBe('Thinking');
  });

  it('detects analyzing', () => {
    expect(deriveReasoningPhrase('I am analyzing the input data')).toBe('Analyzing');
    expect(deriveReasoningPhrase('Let me examine the results')).toBe('Analyzing');
  });

  it('detects calculating', () => {
    expect(deriveReasoningPhrase('calculating the sum of all values')).toBe('Calculating');
  });

  it('detects searching', () => {
    expect(deriveReasoningPhrase('searching for relevant examples')).toBe('Searching');
    expect(deriveReasoningPhrase('looking up the definition')).toBe('Searching');
  });

  it('detects reading', () => {
    expect(deriveReasoningPhrase('reading the provided text')).toBe('Reading');
    expect(deriveReasoningPhrase('parsing the JSON output')).toBe('Reading');
  });

  it('detects writing', () => {
    expect(deriveReasoningPhrase('writing the response now')).toBe('Writing');
    expect(deriveReasoningPhrase('drafting a summary')).toBe('Writing');
  });

  it('detects planning', () => {
    expect(deriveReasoningPhrase('planning the approach step by step')).toBe('Planning');
  });

  it('detects debugging', () => {
    expect(deriveReasoningPhrase('debugging the failing test case')).toBe('Debugging');
  });

  it('uses the last non-empty line for detection', () => {
    // First line says analyze but last line says writing — should pick writing
    const content = 'analyzing the structure\n\nwriting the output now';
    expect(deriveReasoningPhrase(content)).toBe('Writing');
  });

  it('phrase is never longer than 20 chars', () => {
    const testCases = [
      '',
      'analyzing',
      'calculating totals',
      'searching data',
      'random content here',
      'debugging the issue',
      'summarizing findings',
    ];
    for (const c of testCases) {
      expect(deriveReasoningPhrase(c).length).toBeLessThanOrEqual(20);
    }
  });
});

describe('formatThinkingDuration', () => {
  it('formats sub-minute durations as "Xs"', () => {
    expect(formatThinkingDuration(0)).toBe('0s');
    expect(formatThinkingDuration(4)).toBe('4s');
    expect(formatThinkingDuration(59)).toBe('59s');
  });

  it('formats minute-plus durations as "Xm Ys"', () => {
    expect(formatThinkingDuration(60)).toBe('1m 0s');
    expect(formatThinkingDuration(65)).toBe('1m 5s');
    expect(formatThinkingDuration(3661)).toBe('61m 1s');
  });

  it('rounds fractional seconds', () => {
    expect(formatThinkingDuration(4.6)).toBe('5s');
    expect(formatThinkingDuration(65.4)).toBe('1m 5s');
  });
});
