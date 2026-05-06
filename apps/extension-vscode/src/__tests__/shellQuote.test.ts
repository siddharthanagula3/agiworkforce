/**
 * shellQuote.test.ts — D5 cross-platform shell escape coverage
 *
 * Ensures `shellQuoteForCurrentPlatform` produces correct quoting on POSIX
 * (single-quote with `'\''` escape) and Windows (double-quote with `""` and
 * stripping of backtick / `$`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellQuoteForCurrentPlatform } from '../utils/workspaceFolders';

describe('shellQuoteForCurrentPlatform', () => {
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: p });
  }

  describe('POSIX (darwin / linux)', () => {
    it('wraps simple string in single quotes', () => {
      setPlatform('darwin');
      expect(shellQuoteForCurrentPlatform('hello world')).toBe(`'hello world'`);
    });

    it("escapes embedded single quote as '\\''", () => {
      setPlatform('linux');
      expect(shellQuoteForCurrentPlatform("it's a test")).toBe(`'it'\\''s a test'`);
    });

    it('preserves shell metacharacters inside single quotes (no expansion)', () => {
      setPlatform('darwin');
      expect(shellQuoteForCurrentPlatform('$(whoami) `id`')).toBe(`'$(whoami) \`id\`'`);
    });

    it('handles empty string', () => {
      setPlatform('linux');
      expect(shellQuoteForCurrentPlatform('')).toBe(`''`);
    });
  });

  describe('Windows', () => {
    it('wraps simple string in double quotes', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('hello world')).toBe('"hello world"');
    });

    it('strips backticks (PowerShell escape char)', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('test `whoami` end')).toBe('"test whoami end"');
    });

    it('strips $ to prevent variable expansion', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('cost is $5')).toBe('"cost is 5"');
    });

    it('escapes embedded double quote as ""', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('say "hi"')).toBe('"say ""hi"""');
    });

    it('handles empty string', () => {
      setPlatform('win32');
      expect(shellQuoteForCurrentPlatform('')).toBe('""');
    });

    it('combination: backticks + dollars + quotes all neutralized', () => {
      setPlatform('win32');
      const result = shellQuoteForCurrentPlatform('`a` $b "c"');
      expect(result).not.toContain('`');
      expect(result).not.toContain('$');
      expect(result).toBe('"a b ""c"""');
    });
  });
});
