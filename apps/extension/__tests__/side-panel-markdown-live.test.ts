/**
 * Regression coverage for src/features/side-panel/markdown.ts — the LIVE
 * module imported by src/side_panel.ts (via
 * `import { sanitizeHtml, renderMarkdown } from './features/side-panel/markdown'`).
 *
 * __tests__/security-fixes.test.ts and __tests__/sidePanelMarkdown.test.ts
 * cover the same C-04/M-1 fixes, but only against hand-rolled "mirror"
 * functions that reimplement the expected logic rather than importing the
 * real module. That let a real drift bug ship silently: the C-04
 * percent-encoding fix existed only in an orphaned, unimported duplicate
 * (formerly src/side_panel/markdown.ts, now deleted) while the live
 * src/features/side-panel/markdown.ts lacked it. These tests import the
 * live module directly so a regression here cannot hide behind a mirror.
 */

import { describe, expect, it } from 'vitest';
import { renderMarkdown, sanitizeHtml } from '../src/features/side-panel/markdown';

describe('renderMarkdown (live module) — C-04 href percent-encoding', () => {
  it('percent-encodes a double quote in the URL', () => {
    const result = renderMarkdown('[click](https://example.com/")');
    expect(result).toContain('href="https://example.com/%22"');
  });

  it('percent-encodes a single quote in the URL', () => {
    const result = renderMarkdown("[click](https://example.com/')");
    expect(result).toContain('href="https://example.com/%27"');
  });

  it('never leaves a raw < or > inside the href attribute value', () => {
    // renderMarkdown entity-encodes the whole input to &lt;/&gt; up front
    // (defeating raw tag injection before the link regex even runs); the
    // href-specific percent-encoding step is defense-in-depth for any `<`/`>`
    // that reaches it un-entity-encoded. Either encoding is safe — what
    // matters is no literal `<`/`>` character survives inside the href value.
    const result = renderMarkdown('[click](https://example.com/<script>)');
    const innerHref = result.match(/href="([^"]*)"/)?.[1] ?? '';
    expect(innerHref).not.toContain('<');
    expect(innerHref).not.toContain('>');
  });

  it('blocks attribute-injection attempt via a crafted URL', () => {
    const result = renderMarkdown('[click](https://e.com" onerror="alert(1))');
    const innerHref = result.match(/href="([^"]*)"/)?.[1] ?? '';
    // No raw double-quote survives inside the href attribute value — the
    // browser parser can no longer be tricked into treating `onerror=` as a
    // second attribute.
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

describe('renderMarkdown + sanitizeHtml (live module) — end-to-end XSS defense in depth', () => {
  it('a hostile href-breakout payload never becomes a real onerror attribute', () => {
    const hostile = '[click](https://e.com" onerror="alert(1))';
    const clean = sanitizeHtml(renderMarkdown(hostile));
    // Parse the sanitized output for real: the payload text may still be
    // present as inert characters inside the href VALUE (harmless — it's
    // never parsed as an attribute name), but it must never become an
    // actual `onerror` attribute node on the anchor.
    const container = document.createElement('div');
    container.innerHTML = clean;
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.hasAttribute('onerror')).toBe(false);
    expect(anchor?.getAttribute('onclick')).toBeNull();
  });

  it('DOMPurify still strips forbidden attributes even without the percent-encoding layer', () => {
    // Directly exercises the defense-in-depth claim: forbidden event-handler
    // attributes are stripped by sanitizeHtml's own ALLOWED_ATTR/FORBID_ATTR
    // config regardless of how they were introduced into the markup.
    const clean = sanitizeHtml('<a href="https://e.com" onerror="alert(1)">click</a>');
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).toContain('href="https://e.com"');
  });
});
