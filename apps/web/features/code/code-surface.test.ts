import { describe, expect, it } from 'vitest';
import { contextWindowLabel, formatTokenCount } from './code-surface';

describe('formatTokenCount', () => {
  it('reads a small count exactly and a large one in place value', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(61234)).toBe('61.2k');
    expect(formatTokenCount(1000000)).toBe('1M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('never reads below zero', () => {
    expect(formatTokenCount(-40)).toBe('0');
  });
});

describe('contextWindowLabel', () => {
  it('reads used against the window with a whole percentage', () => {
    expect(contextWindowLabel(61234, 1000000)).toBe('61.2k / 1M (6%)');
    expect(contextWindowLabel(0, 200000)).toBe('0 / 200k (0%)');
  });

  it('stops at a full window rather than reporting more', () => {
    expect(contextWindowLabel(300000, 200000)).toBe('300k / 200k (100%)');
  });
});
