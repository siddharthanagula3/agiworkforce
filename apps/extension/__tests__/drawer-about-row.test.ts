import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(here, '..', 'src/side_panel.ts'), 'utf8');

describe('menu footer page label', () => {
  it('starts empty instead of showing placeholder punctuation', () => {
    expect(panel).toMatch(
      /el\(\s*'span',\s*\{ class: 'sp-drawer-about-url', id: 'sp-drawer-about-url' \},?\s*\)/,
    );
  });

  it('is refreshed whenever the menu opens', () => {
    expect(panel).toMatch(
      /function openDrawer[\s\S]*?showDrawerMenu\(\);\s*void refreshDrawerTabInfo\(\);/,
    );
  });
});
