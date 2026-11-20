import { describe, expect, it } from 'vitest';

import {
  extractHtmlText,
  extractPageDescription,
  extractPagePublishedDate,
  extractPageTitle,
  hasStructuredPageData,
  jsonLdPublishedDate,
} from './url-fetch-tool';

const HOSTILE_BUDGET_MS = 2000;
const HOSTILE_TEST_TIMEOUT_MS = 30_000;

function timed<T>(run: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = run();
  return { value, ms: performance.now() - started };
}

describe('page metadata extraction on hostile markup', () => {
  it('reads a published date from unterminated script openers in linear time', () => {
    const html = '<script a'.repeat(65_000);
    const { value, ms } = timed(() => jsonLdPublishedDate(html));
    expect(value).toBeUndefined();
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it('reads a published date from structured-data openers that never close', () => {
    const html = '<script type="application/ld+json">'.repeat(53_000);
    const { value, ms } = timed(() => jsonLdPublishedDate(html));
    expect(value).toBeUndefined();
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it('reads a title from one meta tag with a very long run of attribute-name characters', () => {
    const html = `<meta ${'a'.repeat(120_000)}>`;
    const { value, ms } = timed(() => extractPageTitle(html));
    expect(value).toBeUndefined();
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it(
    'reads a description from one meta tag whose attribute name is a very long run of name characters',
    () => {
      const html = `<meta ${'a:'.repeat(40_000)}>`;
      const { value, ms } = timed(() => extractPageDescription(html));
      expect(value).toBeUndefined();
      expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );
});

describe('page metadata extraction on real-shaped markup', () => {
  const article = `<!doctype html><html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Open &amp; Graph title">
    <meta name='description' content='A page description'>
    <meta property="article:published_time" content="2026-03-04T05:06:07Z">
  </head><body></body></html>`;

  it('reads title, description and meta date', () => {
    expect(extractPageTitle(article)).toBe('Open & Graph title');
    expect(extractPageDescription(article)).toBe('A page description');
    expect(extractPagePublishedDate(article)).toBe('2026-03-04T05:06:07Z');
  });

  it('reads the date from the first structured-data block that has one', () => {
    const html = `<html><head>
      <script type="text/javascript">var x = 1;</script>
      <SCRIPT data-x="1" TYPE='application/ld+json'>{"@type":"Thing","name":"n"}</SCRIPT>
      <script type="application/ld+json">{"@type":"Article","datePublished":"2025-12-31"}</script>
    </head></html>`;
    expect(extractPagePublishedDate(html)).toBe('2025-12-31');
    expect(hasStructuredPageData(html)).toBe(true);
  });

  it('falls back through the structured-data date keys', () => {
    const html =
      '<script type="application/ld+json">{"dateCreated":"2024-01-02","uploadDate":"2024-05-06"}</script>';
    expect(extractPagePublishedDate(html)).toBe('2024-01-02');
  });

  it('ignores structured-data blocks with no closing tag or no date', () => {
    expect(
      extractPagePublishedDate('<script type="application/ld+json">{"datePublished":"2025-01-01"}'),
    ).toBeUndefined();
    expect(
      extractPagePublishedDate('<script type="application/ld+json">{"name":"x"}</script>'),
    ).toBeUndefined();
    expect(
      extractPagePublishedDate(
        '<script type="application/json">{"datePublished":"2025-01-01"}</script>',
      ),
    ).toBeUndefined();
  });

  describe('with a character whose lower case is longer than itself', () => {
    const DOTTED_CAPITALS = '\u0130'.repeat(40);

    it('reads a structured-data date that follows them', () => {
      const html = `<html><head><title>${DOTTED_CAPITALS}</title><script type="application/ld+json">{"datePublished":"2025-01-02"}</script></head></html>`;
      expect(extractPagePublishedDate(html)).toBe('2025-01-02');
    });

    it('reads a meta tag that follows them', () => {
      const html = `<head><title>${DOTTED_CAPITALS}</title><meta property="article:published_time" content="2026-03-04T05:06:07Z"></head>`;
      expect(extractPagePublishedDate(html)).toBe('2026-03-04T05:06:07Z');
    });

    it('reads a title that follows them', () => {
      expect(extractPageTitle(`<head>${DOTTED_CAPITALS}<title>Real title</title></head>`)).toBe(
        'Real title',
      );
    });

    it('drops the style element that follows them and keeps the text after it', () => {
      const text = extractHtmlText(
        `<body><p>${DOTTED_CAPITALS}</p><STYLE>.hidden{color:red}</STYLE><p>kept text</p></body>`,
      );
      expect(text).not.toContain('.hidden');
      expect(text).toContain('kept text');
    });
  });

  it('discards a value that is not a date', () => {
    expect(
      extractPagePublishedDate(
        '<script type="application/ld+json">{"datePublished":"not a date"}</script>',
      ),
    ).toBeUndefined();
  });
});
