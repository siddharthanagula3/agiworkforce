import { describe, expect, it } from 'vitest';

import { discoverIconLinks } from '@/lib/connectors/directory/icon-links';

const HOSTILE_BUDGET_MS = 2000;
const PAGE = 'https://www.example.com/';

describe('discoverIconLinks on a hostile page head', () => {
  it('reads a head full of link openers that never close in linear time', () => {
    const html = '<link '.repeat(80_000);
    const started = performance.now();
    const links = discoverIconLinks(html, PAGE);
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(links).toEqual([]);
  });

  it('still finds the icon that follows a run of unterminated openers', () => {
    const html = `${'<link '.repeat(100)}<link rel="icon" href="/real.png">`;
    expect(discoverIconLinks(html, PAGE)).toEqual(['https://www.example.com/real.png']);
  });

  it('reads one tag that spans a quoted greater-than as the browser-independent first close', () => {
    const html = '<link rel="icon" href="/a.png" title="x>y"><link rel="icon" href="/b.png">';
    expect(discoverIconLinks(html, PAGE)).toEqual([
      'https://www.example.com/a.png',
      'https://www.example.com/b.png',
    ]);
  });
});
