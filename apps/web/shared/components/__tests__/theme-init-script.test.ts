import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { THEME_INIT_SCRIPT } from '../seo/theme-init-script';

const script = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');

function renderWithPersistedTheme(theme: string) {
  return new JSDOM(`<!doctype html><html><head><script>${script}</script></head></html>`, {
    url: 'https://agi.localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.localStorage.setItem('theme', theme);
    },
  });
}

describe('theme-init.js', () => {
  // The layout inlines THEME_INIT_SCRIPT into <head>; /cookies discloses
  // public/theme-init.js as the source of the only pre-consent storage read.
  // If those two ever diverge, the published disclosure stops describing what
  // actually runs, so they are pinned to each other here.
  it('ships byte-identical to the constant the layout inlines', () => {
    expect(THEME_INIT_SCRIPT).toBe(script);
  });

  it('applies a valid persisted theme before hydration', () => {
    const dom = renderWithPersistedTheme('light');
    const root = dom.window.document.documentElement;

    expect(root).toHaveClass('light');
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(root.style.colorScheme).toBe('light');
  });

  it('fails closed to dark for an invalid stored value', () => {
    const dom = renderWithPersistedTheme('not-a-theme');
    const root = dom.window.document.documentElement;

    expect(root).toHaveClass('dark');
    expect(root).not.toHaveClass('light');
  });
});
