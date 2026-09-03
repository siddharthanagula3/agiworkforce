import { describe, expect, it } from 'vitest';
import { renderMarkdown, sanitizeHtml } from '../src/features/side-panel/markdown';

describe('renderMarkdown (live module), C-04 href percent-encoding', () => {
  it('percent-encodes a double quote in the URL', () => {
    const result = renderMarkdown('[click](https://example.com/")');
    expect(result).toContain('href="https://example.com/%22"');
  });

  it('percent-encodes a single quote in the URL', () => {
    const result = renderMarkdown("[click](https://example.com/')");
    expect(result).toContain('href="https://example.com/%27"');
  });

  it('never leaves a raw < or > inside the href attribute value', () => {
    const result = renderMarkdown('[click](https://example.com/<script>)');
    const innerHref = result.match(/href="([^"]*)"/)?.[1] ?? '';
    expect(innerHref).not.toContain('<');
    expect(innerHref).not.toContain('>');
  });

  it('blocks attribute-injection attempt via a crafted URL', () => {
    const result = renderMarkdown('[click](https://e.com" onerror="alert(1))');
    const innerHref = result.match(/href="([^"]*)"/)?.[1] ?? '';
    expect(innerHref).not.toContain('"');
  });

  it('still routes non-http(s) schemes to # (javascript:)', () => {
    const result = renderMarkdown('[click](javascript:alert(1))');
    expect(result).toContain('href="#"');
    expect(result).not.toContain('javascript:');
  });

  it('supports single-level balanced parens in URLs (e.g. Wikipedia links)', () => {
    const result = renderMarkdown('[wiki](https://en.wikipedia.org/wiki/Foo_(bar))');
    expect(result).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"');
  });

  it('leaves a plain https URL with no special characters unchanged', () => {
    const result = renderMarkdown('[click](https://example.com/path?q=1)');
    expect(result).toContain('href="https://example.com/path?q=1"');
  });
});

describe('renderMarkdown + sanitizeHtml (live module), end-to-end XSS defense in depth', () => {
  it('a hostile href-breakout payload never becomes a real onerror attribute', () => {
    const hostile = '[click](https://e.com" onerror="alert(1))';
    const clean = sanitizeHtml(renderMarkdown(hostile));
    const container = document.createElement('div');
    container.innerHTML = clean;
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.hasAttribute('onerror')).toBe(false);
    expect(anchor?.getAttribute('onclick')).toBeNull();
  });

  it('DOMPurify still strips forbidden attributes even without the percent-encoding layer', () => {
    const clean = sanitizeHtml('<a href="https://e.com" onerror="alert(1)">click</a>');
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).toContain('href="https://e.com"');
  });
});
