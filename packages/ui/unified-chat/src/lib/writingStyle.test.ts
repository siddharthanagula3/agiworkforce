import { describe, it, expect, beforeEach } from 'vitest';
import {
  WRITING_STYLE_STORAGE_KEY,
  getWritingStyleInstruction,
  isWritingStyle,
  loadWritingStyle,
  saveWritingStyle,
  type WritingStyle,
} from './writingStyle';

const INHERITED_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty'];

describe('writingStyle', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a persisted style', () => {
    saveWritingStyle('concise');
    expect(loadWritingStyle()).toBe('concise');
    saveWritingStyle(null);
    expect(loadWritingStyle()).toBeNull();
  });

  it('accepts only the declared styles', () => {
    for (const style of ['formal', 'casual', 'concise', 'detailed']) {
      expect(isWritingStyle(style)).toBe(true);
    }
    for (const key of INHERITED_KEYS) {
      expect(isWritingStyle(key)).toBe(false);
    }
    expect(isWritingStyle('nonsense')).toBe(false);
    expect(isWritingStyle(null)).toBe(false);
  });

  it('ignores a stored value that is only an inherited object key', () => {
    for (const key of INHERITED_KEYS) {
      window.localStorage.setItem(WRITING_STYLE_STORAGE_KEY, key);
      expect(loadWritingStyle()).toBeNull();
    }
  });

  it('never returns a non-string instruction for an inherited key', () => {
    for (const key of INHERITED_KEYS) {
      const instruction = getWritingStyleInstruction(key as WritingStyle);
      expect(instruction).toBeNull();
    }
    expect(getWritingStyleInstruction('detailed')).toContain('thorough');
    expect(getWritingStyleInstruction(undefined)).toBeNull();
  });
});
