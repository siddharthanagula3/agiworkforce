import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'features/code/CloudCodePage.module.css'), 'utf8');

function ruleBody(selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css);
  if (!match) throw new Error(`no rule matches ${selectorPattern}`);
  const open = css.indexOf('{', match.index);
  return css.slice(open + 1, css.indexOf('}', open));
}

const WINDOW_CONTROLS = String.raw`:global\(html\[data-desktop-host\^='electron-darwin'\]\[data-host-navigation\]\)`;

describe('Code rail header layout', () => {
  it('keeps the title on one line however narrow the rail row is', () => {
    const body = ruleBody(/^\.railTitle \{/m);

    expect(body).toContain('white-space: nowrap');
    expect(body).toContain('text-overflow: ellipsis');
  });

  it('gives the Chat/Code switch the strip beside the window controls and moves the rest below it', () => {
    const row = ruleBody(new RegExp(`${WINDOW_CONTROLS}\\s+\\.railTop\\[[^\\]]+\\] \\{`));
    const segmented = ruleBody(new RegExp(`${WINDOW_CONTROLS}[^{]*\\.segmented \\{`));
    const title = ruleBody(new RegExp(`${WINDOW_CONTROLS}[^{]*\\.railTitle \\{`));
    const actions = ruleBody(new RegExp(`${WINDOW_CONTROLS}[^{]*\\.railTopActions \\{`));

    expect(row).toContain('display: grid');
    expect(row).toContain('var(--agi-window-title-strip)');
    expect(segmented).toContain('grid-row: 1');
    expect(segmented).toContain('var(--agi-window-title-strip-inset)');
    expect(title).toContain('grid-row: 2');
    expect(actions).toContain('display: contents');
  });
});
