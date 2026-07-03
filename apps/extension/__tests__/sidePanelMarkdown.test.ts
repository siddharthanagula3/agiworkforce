/**
 * Tests for XSS prevention in the side panel's markdown link renderer.
 *
 * Imports the LIVE renderMarkdown() from src/features/side-panel/markdown.ts
 * directly (see EXT-DUPLICATE-MODULE-FORKS-01 / EXT-MIRROR-TEST-FAKE-COVERAGE-01
 * in docs/agent-context/known-flaws.md — this file previously reimplemented a
 * hand-written mirror of the link-sanitisation logic instead of importing the
 * real module, which let the live module drift out of sync with a security
 * fix (C-04 href percent-encoding) while this suite kept passing at 100%).
 */

import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/features/side-panel/markdown';

describe('renderMarkdown — link XSS prevention', () => {
  it('replaces javascript: URLs with #', () => {
    const input = '[click me](javascript:alert(1))';
    const output = renderMarkdown(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('javascript:');
  });

  it('replaces javascript: URLs with leading whitespace with #', () => {
    // Attackers may try whitespace padding to bypass naive prefix checks
    const input = '[click me]( javascript:alert(1))';
    const output = renderMarkdown(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('javascript:');
  });

  it('replaces data: URLs with #', () => {
    const input = '[click me](data:text/html,<script>alert(1)</script>)';
    const output = renderMarkdown(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('data:');
  });

  it('replaces vbscript: URLs with #', () => {
    const input = '[click me](vbscript:msgbox("xss"))';
    const output = renderMarkdown(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('vbscript:');
  });

  it('passes https:// URLs through unchanged', () => {
    const input = '[safe link](https://example.com/page)';
    const output = renderMarkdown(input);
    expect(output).toContain('href="https://example.com/page"');
    expect(output).not.toContain('href="#"');
  });

  it('passes http:// URLs through unchanged', () => {
    const input = '[safe link](http://example.com/page)';
    const output = renderMarkdown(input);
    expect(output).toContain('href="http://example.com/page"');
    expect(output).not.toContain('href="#"');
  });

  it('passes HTTPS:// with mixed case through unchanged', () => {
    const input = '[safe link](HTTPS://example.com/page)';
    const output = renderMarkdown(input);
    expect(output).toContain('href="HTTPS://example.com/page"');
    expect(output).not.toContain('href="#"');
  });

  it('adds target="_blank" and rel="noopener noreferrer" to all links', () => {
    const input = '[safe link](https://example.com)';
    const output = renderMarkdown(input);
    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer"');
  });

  it('preserves the link text for sanitised URLs', () => {
    const input = '[danger](javascript:void(0))';
    const output = renderMarkdown(input);
    expect(output).toContain('>danger</a>');
  });

  it('does not render a link for empty URLs (regex requires at least one url char)', () => {
    // The link regex requires at least one character in the URL group.
    // An empty URL `[text]()` simply passes through as plain text, which is safe.
    const input = '[empty]()';
    const output = renderMarkdown(input);
    // No anchor element should be produced for an empty URL
    expect(output).not.toContain('<a ');
  });

  // C-04 (audit 2026-05-19): href percent-encoding — see also
  // side-panel-markdown-live.test.ts for the fuller regression suite.
  it('percent-encodes a double quote in the URL so it cannot break out of href', () => {
    const output = renderMarkdown('[click](https://e.com" onerror="alert(1))');
    const innerHref = output.match(/href="([^"]*)"/)?.[1] ?? '';
    expect(innerHref).not.toContain('"');
  });
});
