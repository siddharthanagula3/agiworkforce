import { describe, expect, it } from 'vitest';

import {
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  joinSystemTextsAtCacheBoundary,
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
  it('replaces every boundary occurrence with a paragraph break', () => {
    const input = `prefix${SYSTEM_PROMPT_CACHE_BOUNDARY}suffix${SYSTEM_PROMPT_CACHE_BOUNDARY}tail`;
    expect(stripSystemPromptCacheBoundary(input)).toBe('prefix\n\nsuffix\n\ntail');
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

describe('joinSystemTextsAtCacheBoundary', () => {
  it('keeps the opening text as the stable prefix when a later system text arrives', () => {
    const opening = ['agent prompt\n', 'client rules'];
    const alone = joinSystemTextsAtCacheBoundary(opening, []);
    const withLater = joinSystemTextsAtCacheBoundary(opening, ['<attached_files/>']);

    expect(alone).toBe('agent prompt\n\n\nclient rules');
    expect(splitSystemPromptCacheBoundary(withLater)).toEqual({
      stablePrefix: alone,
      dynamicSuffix: '<attached_files/>',
    });
  });

  it('trims trailing whitespace the boundary split would trim anyway', () => {
    const alone = joinSystemTextsAtCacheBoundary(['agent prompt\n'], []);
    const withLater = joinSystemTextsAtCacheBoundary(['agent prompt\n'], ['late']);

    expect(alone).toBe('agent prompt');
    expect(splitSystemPromptCacheBoundary(withLater)?.stablePrefix).toBe(alone);
  });

  it('appends later text to a dynamic tail already behind the boundary', () => {
    const opening = [`stable${SYSTEM_PROMPT_CACHE_BOUNDARY}`];
    expect(joinSystemTextsAtCacheBoundary(opening, [])).toBe(opening[0]);
    expect(
      splitSystemPromptCacheBoundary(joinSystemTextsAtCacheBoundary(opening, ['late'])),
    ).toEqual({ stablePrefix: 'stable', dynamicSuffix: 'late' });
  });

  it('puts later text behind the boundary when nothing opens the conversation', () => {
    expect(joinSystemTextsAtCacheBoundary([], ['late'])).toBe(
      `${SYSTEM_PROMPT_CACHE_BOUNDARY}late`,
    );
    expect(joinSystemTextsAtCacheBoundary([], [])).toBe('');
  });
});
