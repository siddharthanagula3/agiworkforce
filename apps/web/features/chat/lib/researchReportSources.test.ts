import { describe, expect, it } from 'vitest';
import {
  reconcileCitationMarkersFromSourceList,
  stripTrailingCitationOnlyBlock,
  stripTrailingSourceList,
} from './researchReportSources';

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
  it('preserves standalone deliverable links and named links after prose', () => {
    const link = '[View generated video](<https://example.com/video.mp4>)';
    expect(stripTrailingCitationOnlyBlock(link)).toBe(link);
    expect(stripTrailingCitationOnlyBlock(`Your video is ready.\n\n${link}`)).toBe(
      `Your video is ready.\n\n${link}`,
    );
  });
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

describe('reconcileCitationMarkersFromSourceList', () => {
  const delivered = [
    { url: 'https://www.democracynow.org/2026/9/10/headlines' },
    { url: 'https://www.nst.com.my/news/regional/2026/09/1530078/news9' },
    { url: 'https://nypost.com/2026/09/10/' },
  ];

  const answer = [
    '1. **"Trump Predicts Iran War"** - *Democracy Now!* [1]',
    '2. **"TSA Revives Pre-9/11 Tradition"** - *New York Post* [2]',
    '',
    'Sources:',
    '- [1] https://www.democracynow.org/2026/9/10/headlines',
    '- [2] https://nypost.com/2026/09/10/',
  ].join('\n');

  it('moves a marker onto the delivered position of the url the model meant', () => {
    const out = reconcileCitationMarkersFromSourceList(answer, delivered).markdown;
    expect(out).toContain('*Democracy Now!* [1]');
    expect(out).toContain('*New York Post* [3]');
  });

  it('remaps prose references from a model-authored numbered markdown-link source list', () => {
    const canonical = [
      { url: 'https://www.iana.org/help/http-changes' },
      { url: 'https://www.iana.org/help/example-domains' },
      { url: 'https://www.iana.org/domains/reserved' },
    ];
    const report = [
      'The official page explains reserved examples [1][2].',
      '',
      'Five relevant sources:',
      '1. [Example Domains](https://www.iana.org/help/example-domains)',
      '2. [Reserved Domains](https://www.iana.org/domains/reserved)',
      '3. [HTTP changes](https://www.iana.org/help/http-changes)',
      '',
      'These links are useful starting points.',
    ].join('\n');

    const reconciled = reconcileCitationMarkersFromSourceList(report, canonical);
    expect(reconciled.canLinkNumericCitations).toBe(true);
    const out = reconciled.markdown;
    expect(out).toContain('reserved examples [2][3].');
    expect(out).toContain('1. [Example Domains](https://www.iana.org/help/example-domains)');
  });

  it('leaves the trailing block itself untouched for the stripper that follows', () => {
    const out = reconcileCitationMarkersFromSourceList(answer, delivered).markdown;
    expect(stripTrailingSourceList(out)).toBe(
      [
        '1. **"Trump Predicts Iran War"** - *Democracy Now!* [1]',
        '2. **"TSA Revives Pre-9/11 Tradition"** - *New York Post* [3]',
      ].join('\n'),
    );
  });

  it('changes nothing when one bibliography entry names a page the turn never delivered', () => {
    const withStranger = answer.replace(
      'https://nypost.com/2026/09/10/',
      'https://elsewhere.example/x',
    );
    expect(reconcileCitationMarkersFromSourceList(withStranger, delivered).markdown).toBe(
      withStranger,
    );
    expect(reconcileCitationMarkersFromSourceList(withStranger, delivered)).toEqual({
      markdown: withStranger,
      canLinkNumericCitations: false,
    });
  });

  it('does not link numeric markers when the explicit list omits one used in prose', () => {
    const report = [
      'Two claims [1][2].',
      '',
      'Sources:',
      '- [1] https://www.democracynow.org/2026/9/10/headlines',
    ].join('\n');

    expect(reconcileCitationMarkersFromSourceList(report, delivered)).toEqual({
      markdown: report,
      canLinkNumericCitations: false,
    });
  });

  it('does not link conflicting duplicate source numbers', () => {
    const report = [
      'One claim [1].',
      '',
      'Sources:',
      '- [1] https://www.democracynow.org/2026/9/10/headlines',
      '- [1] https://nypost.com/2026/09/10/',
    ].join('\n');

    expect(reconcileCitationMarkersFromSourceList(report, delivered)).toEqual({
      markdown: report,
      canLinkNumericCitations: false,
    });
  });

  it('fails closed for a numbered URL section containing an undelivered page', () => {
    const report = [
      'Official examples [1][2].',
      '',
      '### Three relevant IANA URLs',
      '1. https://www.iana.org/help/example-domains',
      '2. https://www.iana.org/domains/reserved',
      '3. https://www.rfc-editor.org/rfc/rfc2606',
    ].join('\n');

    const known = [
      { url: 'https://www.iana.org/help/example-domains' },
      { url: 'https://www.iana.org/domains/reserved' },
    ];

    expect(reconcileCitationMarkersFromSourceList(report, known)).toEqual({
      markdown: report,
      canLinkNumericCitations: false,
    });
  });

  it('changes nothing when the model already numbered by the delivered order', () => {
    const aligned = [
      'One claim. [1]',
      '',
      'Sources:',
      '- [1] https://www.democracynow.org/2026/9/10/headlines',
    ].join('\n');
    expect(reconcileCitationMarkersFromSourceList(aligned, delivered).markdown).toBe(aligned);
  });

  it('changes nothing on an answer with no trailing source list', () => {
    const plain = 'One claim. [2]';
    expect(reconcileCitationMarkersFromSourceList(plain, delivered).markdown).toBe(plain);
  });

  it('never rewrites a bracketed index inside a fenced code block', () => {
    const withFence = [
      'Body [2].',
      '```',
      'rows[2]',
      '```',
      '',
      'Sources:',
      '- [2] https://nypost.com/2026/09/10/',
    ].join('\n');
    const out = reconcileCitationMarkersFromSourceList(withFence, delivered).markdown;
    expect(out).toContain('Body [3].');
    expect(out).toContain('rows[2]');
  });
});
