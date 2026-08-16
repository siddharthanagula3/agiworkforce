import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

const SOURCES = ['src/side_panel.ts', 'src/features/side-panel/voice.ts'] as const;

const ICON_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}]/u;

describe('icon vocabulary', () => {
  it.each(SOURCES)('%s uses SVG icons rather than emoji glyphs', (file) => {
    const offenders = read(file)
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => ICON_EMOJI.test(line))
      // Comments may legitimately name the glyph they replaced.
      .filter(({ line }) => !/^\s*(\*|\/\/|\/\*)/.test(line));

    expect(
      offenders.map((o) => `${file}:${o.number} ${o.line.trim()}`),
      'emoji used as an icon',
    ).toEqual([]);
  });

  it('provides the icons those glyphs were replaced with', () => {
    const icons = read('src/assets/icons.ts');
    for (const name of ['X', 'Play', 'ChevronDown', 'Check']) {
      expect(icons).toContain(`export const ${name} = svg(`);
    }
  });
});

describe('options page reachability', () => {
  it('is declared in the manifest', () => {
    expect(JSON.parse(read('manifest.json')).options_page).toBe('src/options.html');
  });

  it('has an in-product entry point', () => {
    const panel = read('src/side_panel.ts');
    expect(panel).toContain('chrome.runtime.openOptionsPage()');
    expect(panel).toContain("id: 'sp-drawer-options-btn'");
  });

  it('falls back to the manifest URL on hosts without openOptionsPage', () => {
    expect(read('src/side_panel.ts')).toContain("chrome.runtime.getURL('src/options.html')");
  });
});
