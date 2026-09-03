import { describe, expect, test } from 'vitest';
import {
  MAX_CONTEXT_HTML_CHARS,
  MAX_JSON_LD_BYTES,
  safeJsonParse,
  sanitizePageText,
} from '../../../src/background/policy';

describe('L1 Message Handling - Bounded JSON parsing', () => {
  test('HAPPY_PATH: well-formed in-budget JSON parses', () => {
    expect(safeJsonParse('{"a":1}', MAX_JSON_LD_BYTES)).toEqual({ a: 1 });
  });

  test('SECURITY: oversized JSON returns undefined instead of stalling the parser', () => {
    const huge = `{"x":"${'a'.repeat(MAX_JSON_LD_BYTES + 10)}"}`;
    expect(safeJsonParse(huge, MAX_JSON_LD_BYTES)).toBeUndefined();
  });

  test('ERROR: malformed or missing JSON returns undefined (never throws)', () => {
    expect(safeJsonParse('{not json', MAX_JSON_LD_BYTES)).toBeUndefined();
    expect(safeJsonParse(null, MAX_JSON_LD_BYTES)).toBeUndefined();
    expect(safeJsonParse(undefined, MAX_JSON_LD_BYTES)).toBeUndefined();
  });
});

describe('L1 Message Handling - Page-text sanitization', () => {
  test('SECURITY: invisible Unicode (prompt-injection vehicle) is stripped', () => {
    const malicious = 'Hello​⁨﻿world';
    const cleaned = sanitizePageText(malicious);
    expect(cleaned).toBe('Helloworld');
    expect(cleaned).not.toMatch(/[\u200B\u2068\uFEFF]/);
  });

  test('HAPPY_PATH: ordinary visible text passes through and budget is a finite cap', () => {
    expect(sanitizePageText('normal page text 123')).toContain('normal page text 123');
    expect(Number.isFinite(MAX_CONTEXT_HTML_CHARS)).toBe(true);
    expect(MAX_CONTEXT_HTML_CHARS).toBeGreaterThan(0);
  });
});
