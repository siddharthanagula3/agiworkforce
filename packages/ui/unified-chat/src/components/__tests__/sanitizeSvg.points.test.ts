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
});
