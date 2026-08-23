import { describe, expect, it } from 'vitest';
import { stripTrailingSourceList } from './researchReportSources';

describe('stripTrailingSourceList', () => {
  it('drops a bracketed source list rendered under a bold Sources line', () => {
    const report = [
      '## Summary',
      '',
      'Bhuma Kandula founded Vindynamics [1].',
      '',
      '**Sources**',
      '[1] birsolutions.com — https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ',
      '[2] gust.com — https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUY',
    ].join('\n');

    expect(stripTrailingSourceList(report)).toBe(
      '## Summary\n\nBhuma Kandula founded Vindynamics [1].',
    );
  });

  it('drops a numbered list under a Sources heading', () => {
    const report = '# Report\n\nBody [1].\n\n### References\n\n1. example.com — https://example.com';
    expect(stripTrailingSourceList(report)).toBe('# Report\n\nBody [1].');
  });

  it('keeps a wrapped url that continues the entry above it', () => {
    const report = ['Body [1].', '', 'Sources', '[1] example.com — https://example.com/a', 'bcdef'].join(
      '\n',
    );
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
    const report = 'Claim [1] and claim [2].\n\nSources\n[1] a.com — https://a.com';
    expect(stripTrailingSourceList(report)).toBe('Claim [1] and claim [2].');
  });
});
