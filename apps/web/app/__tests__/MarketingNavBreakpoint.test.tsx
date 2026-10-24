import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve(process.cwd(), 'features/marketing/components/system/system.css'),
  'utf8',
);

function blockAt(source: string, index: number): string {
  const start = source.indexOf('{', index);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unterminated block');
}

function ruleFor(source: string, selector: string): string {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\w-])`, 'u');
  const match = pattern.exec(source);
  expect(match, `${selector} missing`).not.toBeNull();
  return blockAt(source, match!.index + selector.length);
}

const narrowMediaBlock = (() => {
  const marker = '@media (max-width: 767px)';
  let from = 0;
  for (;;) {
    const index = css.indexOf(marker, from);
    expect(index, 'marketing-nav breakpoint missing').toBeGreaterThan(-1);
    const block = blockAt(css, index);
    if (block.includes('.agi-ds-menu-trigger')) return block;
    from = index + marker.length;
  }
})();

describe('marketing nav below the 767px breakpoint', () => {
  it('collapses the desktop nav links and reveals the mobile menu trigger', () => {
    expect(ruleFor(narrowMediaBlock, '.agi-ds-nav')).toContain('display: none');
    expect(ruleFor(narrowMediaBlock, '.agi-ds-menu-trigger')).toContain('display: inline-flex');
  });

  it('hides only the sign-in link, keeping the primary CTA outside the hamburger', () => {
    expect(ruleFor(narrowMediaBlock, '.agi-ds-header-end > .agi-ds-navlink')).toContain(
      'display: none',
    );
    expect(narrowMediaBlock).not.toContain('.agi-ds-btn');
  });
});
