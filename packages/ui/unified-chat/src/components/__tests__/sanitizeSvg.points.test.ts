import { describe, expect, it } from 'vitest';

import { sanitizeSvg } from '../../lib/sanitize-svg';

function polygon(points: string): Element | null {
  const out = sanitizeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="${points}" class="label-container"/></svg>`,
  );
  return new DOMParser().parseFromString(out, 'image/svg+xml').querySelector('polygon');
}

describe('sanitizeSvg polygon points', () => {
  it('keeps the numeric point list a mermaid decision diamond draws with', () => {
    expect(polygon('40,0 80,-40 40,-80 0,-40')?.getAttribute('points')).toBe(
      '40,0 80,-40 40,-80 0,-40',
    );
    expect(polygon('1.5e1 2 -.5,3')?.getAttribute('points')).toBe('1.5e1 2 -.5,3');
  });

  it('drops a points value that is anything but numbers, commas and spaces', () => {
    expect(polygon('0,0 javascript:alert(1)')?.hasAttribute('points')).toBe(false);
    expect(polygon('0,0 url(#x)')?.hasAttribute('points')).toBe(false);
  });

  it('keeps every number form the previous pattern accepted', () => {
    for (const accepted of ['1.', '1.5', '.5', '5e3', '-1.5E+2', '+3', '007', '0.0e-0']) {
      expect(polygon(`${accepted} 1`)?.getAttribute('points'), accepted).toBe(`${accepted} 1`);
    }
  });

  it('drops every malformed number the previous pattern refused', () => {
    for (const refused of ['.', '1e', 'e1', '1..2', '--1', '1.5.5', '1e+', '+.', '1,,.']) {
      expect(polygon(`${refused} 1`)?.hasAttribute('points'), refused).toBe(false);
    }
  });

  it('answers a 100000 character run of zeros in linear time', () => {
    const started = performance.now();
    expect(polygon(`${'0'.repeat(100_000)}x`)?.hasAttribute('points')).toBe(false);
    expect(polygon('0'.repeat(100_000))?.hasAttribute('points')).toBe(true);
    expect(polygon(`${'00'.repeat(50_000)}.${'0'.repeat(50_000)}e`)?.hasAttribute('points')).toBe(
      false,
    );
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
