import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { THEME_INIT_SCRIPT } from '../seo/theme-init-script';

const script = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');

function renderWithPersistedTheme(theme: string, host?: { platform: unknown }) {
  return new JSDOM(`<!doctype html><html><head><script>${script}</script></head></html>`, {
    url: 'https://agi.localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.localStorage.setItem('theme', theme);
      if (host) Object.assign(window, { agiHost: host });
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

  // The desktop shell hides the native title bar and hands the top of the
  // window back to the page. The page has to know that before it paints, or the
  // brand mark renders under the window buttons and then jumps.
  it('marks the document with the desktop host before first paint', () => {
    const dom = renderWithPersistedTheme('dark', { platform: 'electron-darwin' });

    expect(dom.window.document.documentElement).toHaveAttribute(
      'data-desktop-host',
      'electron-darwin',
    );
  });

  it('leaves the attribute off in a browser', () => {
    const dom = renderWithPersistedTheme('dark');

    expect(dom.window.document.documentElement).not.toHaveAttribute('data-desktop-host');
  });

  it('ignores a host that does not name its platform', () => {
    const dom = renderWithPersistedTheme('dark', { platform: 7 });

    expect(dom.window.document.documentElement).not.toHaveAttribute('data-desktop-host');
  });
});
