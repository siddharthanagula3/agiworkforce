/**
 * Golden tests for the system-prompt cache boundary marker.
 *
 * The marker splits a system prompt into a long-cacheable stable prefix and
 * a short-cacheable dynamic suffix; Anthropic's cache_control attaches to
 * the prefix to maximize cache hit rate. Adapter callers depend on
 * `splitSystemPromptCacheBoundary()` returning specific shapes.
 */

import { describe, expect, it } from 'vitest';

import {
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  prependSystemPromptAdditionAfterCacheBoundary,
  splitSystemPromptCacheBoundary,
  stripSystemPromptCacheBoundary,
} from '../system-prompt-cache-boundary';

describe('SYSTEM_PROMPT_CACHE_BOUNDARY constant', () => {
  it('is a multi-line HTML comment sentinel', () => {
    expect(SYSTEM_PROMPT_CACHE_BOUNDARY).toBe('\n<!-- AGIWORKFORCE_CACHE_BOUNDARY -->\n');
  });
});

describe('stripSystemPromptCacheBoundary', () => {
  it('replaces every boundary occurrence with a single newline', () => {
    const input = `prefix${SYSTEM_PROMPT_CACHE_BOUNDARY}suffix${SYSTEM_PROMPT_CACHE_BOUNDARY}tail`;
    expect(stripSystemPromptCacheBoundary(input)).toBe('prefix\nsuffix\ntail');
  });
  it('returns the input unchanged when no boundary is present', () => {
    expect(stripSystemPromptCacheBoundary('plain text')).toBe('plain text');
  });
});

describe('splitSystemPromptCacheBoundary', () => {
  it('returns undefined when no boundary is present', () => {
    expect(splitSystemPromptCacheBoundary('no marker here')).toBeUndefined();
  });

  it('splits into trimmed stablePrefix + trimmed dynamicSuffix', () => {
    const input = `stable header  ${SYSTEM_PROMPT_CACHE_BOUNDARY}  dynamic body`;
    const split = splitSystemPromptCacheBoundary(input);
    expect(split).toEqual({
      stablePrefix: 'stable header',
      dynamicSuffix: 'dynamic body',
    });
  });

  it('splits at the first boundary when multiple are present', () => {
    const input = `A${SYSTEM_PROMPT_CACHE_BOUNDARY}B${SYSTEM_PROMPT_CACHE_BOUNDARY}C`;
    const split = splitSystemPromptCacheBoundary(input);
    expect(split?.stablePrefix).toBe('A');
    // The split returns suffix as the entire remainder including subsequent boundaries.
    expect(split?.dynamicSuffix).toContain('B');
    expect(split?.dynamicSuffix).toContain('C');
  });
});

describe('prependSystemPromptAdditionAfterCacheBoundary', () => {
  it('prepends the addition on top when the prompt has no boundary', () => {
    const out = prependSystemPromptAdditionAfterCacheBoundary({
      systemPrompt: 'base prompt',
      systemPromptAddition: 'EXTRA',
    });
    expect(out).toBe('EXTRA\n\nbase prompt');
  });

  it('inserts the addition AFTER the boundary so the prefix stays cacheable', () => {
    const prompt = `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic`;
    const out = prependSystemPromptAdditionAfterCacheBoundary({
      systemPrompt: prompt,
      systemPromptAddition: 'EXTRA',
    });
    // The cacheable prefix must remain stable so the cache key doesn't churn.
    expect(out.startsWith('stable')).toBe(true);
    expect(out).toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
    expect(out).toContain('EXTRA');
    expect(out).toContain('dynamic');
  });

  it('returns the original prompt when no addition is supplied', () => {
    const prompt = `stable${SYSTEM_PROMPT_CACHE_BOUNDARY}dynamic`;
    expect(prependSystemPromptAdditionAfterCacheBoundary({ systemPrompt: prompt })).toBe(prompt);
  });
});
