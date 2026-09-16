import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(import.meta.dirname, '../styles/globals.css'), 'utf8');

function reducedMotionBlocks(): string[] {
  const blocks: string[] = [];
  const marker = '@media (prefers-reduced-motion: reduce)';
  let index = stylesheet.indexOf(marker);
  while (index !== -1) {
    let depth = 0;
    let cursor = stylesheet.indexOf('{', index);
    const start = cursor;
    while (cursor < stylesheet.length) {
      if (stylesheet[cursor] === '{') depth += 1;
      else if (stylesheet[cursor] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    blocks.push(stylesheet.slice(start, cursor + 1));
    index = stylesheet.indexOf(marker, cursor);
  }
  return blocks;
}

// A per-class answer to prefers-reduced-motion leaves every animation nobody
// remembered at full speed, and a new one escapes silently. The shell animates
// almost entirely through Tailwind utilities, so the blanket rule is the only
// shape that stays true.
describe('the desktop shell answers the OS reduced-motion setting', () => {
  it('neutralises animation, transition and smooth scrolling for everything', () => {
    const blanket = reducedMotionBlocks().find((block) => /\*,\s*\n\s*\*::before/u.test(block));

    expect(blanket, 'no universal prefers-reduced-motion rule in globals.css').toBeDefined();
    for (const property of [
      'animation-duration',
      'animation-iteration-count',
      'transition-duration',
      'scroll-behavior',
    ]) {
      expect(blanket).toContain(property);
    }
  });

  // A frozen spinner reads as a hung screen, which is a worse answer than a
  // slow one, so this one animation is slowed rather than stopped.
  it('slows the spinner instead of freezing it', () => {
    const spinner = reducedMotionBlocks().find((block) => block.includes('.animate-spin'));

    expect(spinner, 'reduced motion does not mention .animate-spin').toBeDefined();
    expect(spinner).toMatch(/animation-iteration-count:\s*infinite/u);
    expect(spinner).not.toMatch(/\.animate-spin\s*\{[^}]*animation:\s*none/u);
  });
});
