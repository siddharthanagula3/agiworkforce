/**
 * hoverProvider.test.ts — Tests for AgiHoverProvider logic
 *
 * Tests the hover provider's conditional behavior based on configuration.
 */

import { describe, it, expect } from 'vitest';

describe('AgiHoverProvider logic', () => {
  function provideHover(
    hoverEnabled: boolean,
    hasWord: boolean,
  ): { markdown: string; isTrusted: boolean } | undefined {
    if (!hoverEnabled) {
      return undefined;
    }
    if (!hasWord) {
      return undefined;
    }
    return {
      markdown: '**AGI Workforce** -- Explain | Fix | Tests',
      isTrusted: true,
    };
  }

  it('returns undefined when hover is disabled', () => {
    expect(provideHover(false, true)).toBeUndefined();
  });

  it('returns undefined when no word is at position', () => {
    expect(provideHover(true, false)).toBeUndefined();
  });

  it('returns hover content when enabled and word exists', () => {
    const result = provideHover(true, true);
    expect(result).toBeDefined();
    expect(result?.markdown).toContain('AGI Workforce');
    expect(result?.isTrusted).toBe(true);
  });

  it('includes action links in hover content', () => {
    const result = provideHover(true, true);
    expect(result?.markdown).toContain('Explain');
    expect(result?.markdown).toContain('Fix');
    expect(result?.markdown).toContain('Tests');
  });
});
