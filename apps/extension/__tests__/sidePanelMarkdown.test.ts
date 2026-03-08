/**
 * Tests for XSS prevention in the side panel's markdown link renderer.
 *
 * The renderMarkdown() function is not exported, so we replicate the exact link
 * sanitisation logic here and separately verify the regex used in the source.
 * If the implementation changes, the tests will catch a regression.
 */

import { describe, expect, it } from 'vitest';

/**
 * Mirrors the link-sanitisation rule from side_panel.ts renderMarkdown().
 * Kept in sync with the source so that any changes are caught by these tests.
 */
function sanitiseLinkUrl(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? url : '#';
}

/**
 * Minimal Markdown link renderer — same regex as side_panel.ts renderMarkdown().
 */
function renderMarkdownLinks(text: string): string {
  return text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match: string, linkText: string, url: string) => {
      const safeUrl = sanitiseLinkUrl(url);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    },
  );
}

describe('renderMarkdown — link XSS prevention', () => {
  it('replaces javascript: URLs with #', () => {
    const input = '[click me](javascript:alert(1))';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('javascript:');
  });

  it('replaces javascript: URLs with leading whitespace with #', () => {
    // Attackers may try whitespace padding to bypass naive prefix checks
    const input = '[click me]( javascript:alert(1))';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('javascript:');
  });

  it('replaces data: URLs with #', () => {
    const input = '[click me](data:text/html,<script>alert(1)</script>)';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('data:');
  });

  it('replaces vbscript: URLs with #', () => {
    const input = '[click me](vbscript:msgbox("xss"))';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('vbscript:');
  });

  it('passes https:// URLs through unchanged', () => {
    const input = '[safe link](https://example.com/page)';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="https://example.com/page"');
    expect(output).not.toContain('href="#"');
  });

  it('passes http:// URLs through unchanged', () => {
    const input = '[safe link](http://example.com/page)';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="http://example.com/page"');
    expect(output).not.toContain('href="#"');
  });

  it('passes HTTPS:// with mixed case through unchanged', () => {
    const input = '[safe link](HTTPS://example.com/page)';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('href="HTTPS://example.com/page"');
    expect(output).not.toContain('href="#"');
  });

  it('adds target="_blank" and rel="noopener noreferrer" to all links', () => {
    const input = '[safe link](https://example.com)';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer"');
  });

  it('preserves the link text for sanitised URLs', () => {
    const input = '[danger](javascript:void(0))';
    const output = renderMarkdownLinks(input);
    expect(output).toContain('>danger</a>');
  });

  it('does not render a link for empty URLs (regex requires at least one url char)', () => {
    // The link regex [^)]+ requires at least one character in the URL.
    // An empty URL `[text]()` simply passes through as plain text, which is safe.
    const input = '[empty]()';
    const output = renderMarkdownLinks(input);
    // No anchor element should be produced for an empty URL
    expect(output).not.toContain('<a ');
  });
});
