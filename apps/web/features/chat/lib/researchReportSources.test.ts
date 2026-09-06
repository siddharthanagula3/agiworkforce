import { describe, expect, it } from 'vitest';
import { stripTrailingCitationOnlyBlock, stripTrailingSourceList } from './researchReportSources';

describe('stripTrailingSourceList', () => {
  it('drops a bracketed source list rendered under a bold Sources line', () => {
    const report = [
      '## Summary',
      '',
      'Bhuma Kandula founded Vindynamics [1].',
      '',
      '**Sources**',
      '[1] birsolutions.com, https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ',
      '[2] gust.com, https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUY',
    ].join('\n');

    expect(stripTrailingSourceList(report)).toBe(
      '## Summary\n\nBhuma Kandula founded Vindynamics [1].',
    );
  });

  it('drops a numbered list under a Sources heading', () => {
    const report = '# Report\n\nBody [1].\n\n### References\n\n1. example.com, https://example.com';
    expect(stripTrailingSourceList(report)).toBe('# Report\n\nBody [1].');
  });

  it('keeps a wrapped url that continues the entry above it', () => {
    const report = [
      'Body [1].',
      '',
      'Sources',
      '[1] example.com, https://example.com/a',
      'bcdef',
    ].join('\n');
    expect(stripTrailingSourceList(report)).toBe('Body [1].');
  });

  it('strips a heading that has not streamed its entries yet', () => {
    expect(stripTrailingSourceList('Body [1].\n\nSources\n')).toBe('Body [1].');
  });

  it('keeps a Sources section that carries prose', () => {
    const report = 'Body.\n\n## Sources\n\nWe relied on public filings and press coverage.';
    expect(stripTrailingSourceList(report)).toBe(report);
  });

  it('leaves a report without a source list untouched', () => {
    const report = '# Report\n\nBody [1].\n\n## Outlook\n\nMore text.';
    expect(stripTrailingSourceList(report)).toBe(report);
  });

  it('leaves inline citations in place', () => {
    const report = 'Claim [1] and claim [2].\n\nSources\n[1] a.com, https://a.com';
    expect(stripTrailingSourceList(report)).toBe('Claim [1] and claim [2].');
  });
});

describe('stripTrailingSourceList on chat answers', () => {
  it('drops definition style entries a chat model writes under a Sources line', () => {
    const body =
      'Starts at $2,499 [1].\n\nSources:\n[1]: apple.com\n[2]: 9to5mac.com\n[3]: macrumors.com';
    expect(stripTrailingSourceList(body)).toBe('Starts at $2,499 [1].');
  });

  it('drops entries that carry a dash and a description after the markers', () => {
    const body =
      'Recordation is ministerial [1][2].\n\n**Sources:**\n[1][2] - USPTO states recordation is ministerial.\n[3] - accrued damages.';
    expect(stripTrailingSourceList(body)).toBe('Recordation is ministerial [1][2].');
  });

  it('drops a Sources line whose entries sit on the same line', () => {
    expect(stripTrailingSourceList('Answer [1].\n\nSources: [1] [2] (apple.com)')).toBe(
      'Answer [1].',
    );
  });
});

describe('stripTrailingCitationOnlyBlock', () => {
  it('drops a headingless tail of bracketed markers with a parenthesised host', () => {
    const answer = [
      'The strongest candidates are DataSpace [1], Benchmarking the Benchmarks [2].',
      '',
      '[1] (artificialanalysis.ai)',
      '[2] (artificialanalysis.ai)',
      '[3] (artificialanalysis.ai)',
      '[4] (artificialanalysis.ai)',
    ].join('\n');

    expect(stripTrailingCitationOnlyBlock(answer)).toBe(
      'The strongest candidates are DataSpace [1], Benchmarking the Benchmarks [2].',
    );
  });

  it('drops a tail of markdown citation links', () => {
    const answer = [
      'See the papers for details [1] [2].',
      '',
      '[1] ([artificialanalysis.ai](https://artificialanalysis.ai/x))',
      '[2] ([kiplinger.com](https://kiplinger.com/y))',
    ].join('\n');

    expect(stripTrailingCitationOnlyBlock(answer)).toBe('See the papers for details [1] [2].');
  });

  it('keeps a trailing line that carries real prose alongside a citation', () => {
    const answer = 'Body.\n\nAs covered here [1] (nature.com), this remains unresolved.';
    expect(stripTrailingCitationOnlyBlock(answer)).toBe(answer);
  });

  it('leaves an answer with no trailing citation block untouched', () => {
    const answer = 'Body [1].\n\nMore prose follows the citation.';
    expect(stripTrailingCitationOnlyBlock(answer)).toBe(answer);
  });

  it('keeps inline citations inside the body', () => {
    const answer = 'Claim one [1]. Claim two [2].\n\nA closing sentence with no citations.';
    expect(stripTrailingCitationOnlyBlock(answer)).toBe(answer);
  });

  it('trims trailing blank lines along with the stripped block', () => {
    const answer = 'Body [1].\n\n[1] (example.com)\n\n\n';
    expect(stripTrailingCitationOnlyBlock(answer)).toBe('Body [1].');
  });
});
