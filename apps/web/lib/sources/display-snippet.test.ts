import { describe, expect, it } from 'vitest';

import { displaySourceSnippet } from './display-snippet';

const OPAQUE_PROVIDER_TOKEN =
  'EqoDCioIBhgCIiQ0NGFlNjc2Yy05NThmLTRkNjQtYTQ3ZS0wNzMxNjZhNzE3ODQSDBlC8ePkQx7r9XmXrRoMbXNhdGVzLWNoYXQtMSIwTWQ2ZXF0V3pJcVhqR1RkUmF4eXpWbnZ4c0Y1K1FyNE1PeFRtWlZGU0dKZz0=';

describe('displaySourceSnippet', () => {
  it('keeps readable prose', () => {
    expect(displaySourceSnippet('WCAG 2.2 covers a wide range of recommendations.')).toBe(
      'WCAG 2.2 covers a wide range of recommendations.',
    );
  });

  it('withholds an opaque provider token rather than showing it as a summary', () => {
    expect(displaySourceSnippet(OPAQUE_PROVIDER_TOKEN)).toBe('');
    expect(displaySourceSnippet(`Summary: ${OPAQUE_PROVIDER_TOKEN}`)).toBe('');
  });

  it('treats a missing, empty or non-text value as no summary', () => {
    expect(displaySourceSnippet(undefined)).toBe('');
    expect(displaySourceSnippet(null)).toBe('');
    expect(displaySourceSnippet('   ')).toBe('');
    expect(displaySourceSnippet(42)).toBe('');
  });

  it('keeps prose that carries a link, a long slug or text without spaces', () => {
    const withLink =
      'Read more at https://example.com/audit/very-long-path-segment-for-layout-checking/another-long-path-segment for details.';
    expect(displaySourceSnippet(withLink)).toBe(withLink);
    expect(displaySourceSnippet('東京の天気は晴れのち曇りで、最高気温は二十五度の予報です。')).toBe(
      '東京の天気は晴れのち曇りで、最高気温は二十五度の予報です。',
    );
  });

  it('strips control characters but keeps line breaks', () => {
    expect(displaySourceSnippet('line one\u0000\nline two')).toBe('line one\nline two');
  });

  it('keeps a long readable snippet whole', () => {
    const long = 'A readable sentence about the standard. '.repeat(40).trim();
    expect(displaySourceSnippet(long)).toBe(long);
  });
});
