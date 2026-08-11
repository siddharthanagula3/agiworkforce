import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

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
