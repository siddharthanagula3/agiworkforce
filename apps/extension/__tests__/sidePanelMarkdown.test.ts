import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/features/side-panel/markdown';

describe('renderMarkdown, link XSS prevention', () => {
  it('replaces javascript: URLs with #', () => {
    const input = '[click me](javascript:alert(1))';
    const output = renderMarkdown(input);
    expect(output).toContain('href="#"');
    expect(output).not.toContain('javascript:');
  });

  it('replaces javascript: URLs with leading whitespace with #', () => {
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
    const input = '[empty]()';
    const output = renderMarkdown(input);
    expect(output).not.toContain('<a ');
  });

  it('percent-encodes a double quote in the URL so it cannot break out of href', () => {
    const output = renderMarkdown('[click](https://e.com" onerror="alert(1))');
    const innerHref = output.match(/href="([^"]*)"/)?.[1] ?? '';
    expect(innerHref).not.toContain('"');
  });
});
