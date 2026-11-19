import { describe, expect, it } from 'vitest';

import { extractArtifactTitle } from '../artifact-derivation';

const HOSTILE_BUDGET_MS = 2000;

describe('extractArtifactTitle on a hostile heading', () => {
  it('reads a heading made of less-than signs with no closing bracket in linear time', () => {
    const content = `<h1>${'<'.repeat(200_000)}</h1>`;
    const started = performance.now();
    const title = extractArtifactTitle(content);
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(title).toBe('<'.repeat(200_000));
  });

  it('reads a heading made of unterminated tag openers in linear time', () => {
    const content = `<h1>${'<b '.repeat(115_000)}</h1>`;
    const started = performance.now();
    extractArtifactTitle(content);
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
  });
});

describe('extractArtifactTitle on real-shaped headings', () => {
  it.each([
    ['<h1>Heading <b>x</b></h1>', 'Heading x'],
    ['<h1 class="a>b">Quarterly <em>plan</em> review</h1>', 'b">Quarterly plan review'],
    ['<h1>1 < 2 and 3 > 2</h1>', '1  2'],
    ['<h1>a <<b> c</h1>', 'a  c'],
    ['<h1><span></span></h1>\nFallback line', 'Fallback line'],
    ['<H1>Upper</H1>', 'Upper'],
    ['<h1>Use List<> in Java</h1>', 'Use List in Java'],
    ['<h1>ab<>cd</h1>', 'abcd'],
    ['<h1>1 <</h1>', '1 <'],
    ['<h1>a < b</h1>', 'a < b'],
  ])('%s', (content, expected) => {
    expect(extractArtifactTitle(content)).toBe(expected);
  });
});
