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
    for (const output of ['mathml', 'htmlAndMathml'] as const) {
      for (const tex of ['\\href{javascript:alert(1)}{x}', '\\htmlClass{evil}{x}']) {
        const result = renderMathMarkup(tex, false, output);
        const markup = result.ok ? result.markup : '';
        expect(markup).not.toMatch(/\bhref=/);
        expect(markup).not.toContain('class="evil"');
        expect(markup).not.toContain('<a ');
      }
    }
  });

  it('gives the MathML of a MathML render as its spoken source', () => {
    const result = renderMathMarkup('E = mc^2', false);

    expect(result.ok && result.mathml).toBe(result.ok && result.markup);
  });

  it('draws KaTeX HTML that loads nothing and keeps the MathML for reading aloud', () => {
    const result = renderMathMarkup('\\boxed{E=mc^2} + \\cancel{x}', false, 'htmlAndMathml');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markup).toContain('class="katex-html"');
    expect(result.markup).toContain('fbox');
    expect(result.markup).not.toMatch(/<script|<link|<img|\b(?:src|href)=|url\(/i);
    expect(result.mathml.startsWith('<math')).toBe(true);
    expect(result.mathml.endsWith('</math>')).toBe(true);
    expect(result.mathml).toContain('<menclose');
    expect(result.mathml).not.toContain('katex-html');
  });

  it('marks display math drawn as KaTeX HTML as a display block', () => {
    const result = renderMathMarkup(
      '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
      true,
      'htmlAndMathml',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markup).toContain('class="katex-display"');
    expect(result.markup).toContain('class="arraycolsep"');
    expect(result.mathml).toContain('display="block"');
  });
});
