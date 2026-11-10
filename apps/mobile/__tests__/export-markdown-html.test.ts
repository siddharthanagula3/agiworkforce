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
