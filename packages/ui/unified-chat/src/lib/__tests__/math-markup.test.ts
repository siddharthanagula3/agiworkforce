import { describe, expect, it } from 'vitest';
import { renderMathMarkup } from '../math-markup';

describe('renderMathMarkup', () => {
  it('turns inline LaTeX into MathML that needs no stylesheet, font or script', () => {
    const result = renderMathMarkup('E = mc^2', false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markup).toContain('<math');
    expect(result.markup).toContain('<msup>');
    expect(result.markup).not.toContain('display="block"');
    expect(result.markup).not.toMatch(/<script|<link|<img|\b(?:src|href)=|url\(/i);
  });

  it('marks display math as a block', () => {
    const result = renderMathMarkup('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markup).toContain('display="block"');
    expect(result.markup).toContain('<mfrac>');
    expect(result.markup).toContain('<msqrt>');
  });

  it('reports LaTeX it cannot parse instead of returning broken markup', () => {
    const result = renderMathMarkup('\\frac{1}{', false);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toBe('');
  });

  it('refuses commands that would put a link or raw HTML into the markup', () => {
    for (const tex of ['\\href{javascript:alert(1)}{x}', '\\htmlClass{evil}{x}']) {
      const result = renderMathMarkup(tex, false);
      const markup = result.ok ? result.markup : '';
      expect(markup).not.toMatch(/\bhref=/);
      expect(markup).not.toContain('class="evil"');
      expect(markup).not.toContain('<a ');
    }
  });
});
