import { markdownToExportHtml } from '../services/exportMarkdownHtml';

describe('markdownToExportHtml links', () => {
  it('keeps a destination containing double underscores byte for byte', () => {
    const { html } = markdownToExportHtml('[Report](https://example.invalid/a__b__c)');

    expect(html).toContain('<a href="https://example.invalid/a__b__c">Report</a>');
    expect(html).not.toContain('<strong>');
  });

  it('keeps asterisk, tilde and single underscore runs in a destination', () => {
    const { html } = markdownToExportHtml(
      '[One](https://example.invalid/a*b*c) [Two](https://example.invalid/x~~y~~z) [Three](https://example.invalid/p_q_r)',
    );

    expect(html).toContain('href="https://example.invalid/a*b*c"');
    expect(html).toContain('href="https://example.invalid/x~~y~~z"');
    expect(html).toContain('href="https://example.invalid/p_q_r"');
    expect(html).not.toMatch(/<(?:em|strong|del)>/);
  });

  it('still formats emphasis inside the link label', () => {
    const { html } = markdownToExportHtml(
      '[**Report** and __notes__](https://example.invalid/a__b__c)',
    );

    expect(html).toContain(
      '<a href="https://example.invalid/a__b__c"><strong>Report</strong> and <strong>notes</strong></a>',
    );
  });

  it('escapes the destination and drops an unsafe scheme', () => {
    const { html } = markdownToExportHtml(
      '[Query](https://example.invalid/?a=1&b=2) [Bad](javascript:alert(1))',
    );

    expect(html).toContain('href="https://example.invalid/?a=1&amp;b=2"');
    expect(html).not.toContain('javascript:');
  });
});

describe('markdownToExportHtml math', () => {
  it('writes inline and display math as MathML, so the export loads no script', () => {
    const { html } = markdownToExportHtml(
      'Energy is $E = mc^2$.\n\n$$\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n$$',
    );

    expect(html).toContain('<span class="math rendered"><span class="katex"><math');
    expect(html).toContain('<div class="math display rendered">');
    expect(html).toContain('display="block"');
    expect(html).not.toMatch(/<script|<link|\b(?:src|href)=|url\(/i);
  });

  it('keeps LaTeX it cannot parse as escaped source text', () => {
    const { html } = markdownToExportHtml('Broken $\\frac{1}{<b>$ here');

    expect(html).toContain('<span class="math">\\frac{1}{&lt;b&gt;</span>');
    expect(html).not.toContain('<b>');
  });
});
