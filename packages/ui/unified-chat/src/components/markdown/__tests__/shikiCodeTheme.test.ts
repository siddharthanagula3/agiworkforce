import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CODE_THEMES,
  DEFAULT_CODE_THEME,
  clearHighlightCache,
  getCodeTheme,
  highlightToLines,
  isCodeThemeId,
  readHighlightCache,
  setCodeTheme,
  subscribeCodeTheme,
} from '../shikiHighlighter';

const CODE = 'const answer = 42;';

afterEach(() => {
  setCodeTheme(DEFAULT_CODE_THEME);
  clearHighlightCache();
});

describe('code theme', () => {
  it('only accepts a theme it can load', () => {
    expect(isCodeThemeId('catppuccin')).toBe(true);
    expect(isCodeThemeId('toString')).toBe(false);
    expect(isCodeThemeId(undefined)).toBe(false);
    expect(Object.keys(CODE_THEMES)).toContain(DEFAULT_CODE_THEME);
  });

  it('tells subscribers when the theme changes and stays quiet when it does not', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCodeTheme(listener);

    setCodeTheme(DEFAULT_CODE_THEME);
    setCodeTheme('everforest');
    unsubscribe();
    setCodeTheme('dracula-soft');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getCodeTheme()).toBe('dracula-soft');
  });

  it('paints the dark slot from the chosen theme and keeps each theme in its own cache entry', async () => {
    const github = await highlightToLines(CODE, 'ts');
    setCodeTheme('catppuccin');
    expect(readHighlightCache(CODE, 'ts')).toBeNull();
    const catppuccin = await highlightToLines(CODE, 'ts');

    const darkOf = (lines: typeof github) =>
      lines?.[0]?.map((token) => (token.style as Record<string, string>)['--shiki-dark']);
    const lightOf = (lines: typeof github) =>
      lines?.[0]?.map((token) => (token.style as Record<string, string>)['--shiki-light']);
    expect(darkOf(catppuccin)).not.toEqual(darkOf(github));
    expect(lightOf(catppuccin)).toEqual(lightOf(github));

    setCodeTheme(DEFAULT_CODE_THEME);
    expect(readHighlightCache(CODE, 'ts')).toBe(github);
  });
});
