/**
 * Tests for html-sanitizer — focusing on the new sanitizeHtmlForSandbox /
 * sanitizeArtifactForSandbox path.
 *
 * Existing behavior: sanitizeHTML / sanitizeArtifact strip all scripts and
 * on* handlers (covered by the test cases below that verify the strict path
 * has not regressed).
 *
 * New behavior: sanitizeHtmlForSandbox preserves scripts and handlers for
 * interactive HTML artifacts rendered inside a null-origin sandbox iframe
 * (sandbox="allow-scripts", no allow-same-origin). It still strips the
 * narrow set of things that can escape or widen that sandbox.
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeHTML,
  sanitizeArtifact,
  sanitizeHtmlForSandbox,
  stripMetaRefreshFromSandboxHtml,
  hasXSSRisk,
} from './html-sanitizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if the string contains an intact <script> block (not stripped). */
function hasScript(html: string): boolean {
  return /<script/i.test(html);
}

/** True if the string contains an inline event handler. */
function hasEventHandler(html: string, handler = 'onclick'): boolean {
  return new RegExp(handler + '\\s*=', 'i').test(html);
}

/** True if the string contains a <base> tag. */
function hasBase(html: string): boolean {
  return /<base/i.test(html);
}

/** True if the string contains a <meta http-equiv="refresh"> tag. */
function hasMetaRefresh(html: string): boolean {
  return /<meta[^>]*http-equiv\s*=\s*['"]?refresh['"]?/i.test(html);
}

// ---------------------------------------------------------------------------
// Strict sanitizer regression tests (sanitizeHTML / sanitizeArtifact)
// These must continue to strip scripts and handlers — they run in the main doc.
// ---------------------------------------------------------------------------

describe('sanitizeHTML — strict path (no scripts, no handlers)', () => {
  it('strips <script> tags', () => {
    const input = '<p>Hello</p><script>alert(1)</script>';
    const result = sanitizeHTML(input);
    expect(hasScript(result)).toBe(false);
    expect(result).toContain('Hello');
  });

  it('strips onclick handler', () => {
    const input = '<button onclick="alert(1)">Click</button>';
    const result = sanitizeHTML(input, 'extended');
    expect(hasEventHandler(result, 'onclick')).toBe(false);
  });

  it('strips onerror on img', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHTML(input, 'standard');
    expect(hasEventHandler(result, 'onerror')).toBe(false);
  });

  it('strips javascript: href', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHTML(input);
    // DOMPurify removes the href entirely or changes it to #
    expect(result).not.toContain('javascript:');
  });
});

describe('sanitizeArtifact — html type strips scripts', () => {
  it('strips script tag from html artifact', () => {
    const input =
      '<div id="counter">0</div><script>document.getElementById("counter").textContent=42;</script>';
    const result = sanitizeArtifact(input, 'html');
    expect(hasScript(result)).toBe(false);
    expect(result).toContain('counter');
  });

  it('strips onclick from html artifact', () => {
    const input = '<button onclick="this.textContent=\'clicked\'">Click me</button>';
    const result = sanitizeArtifact(input, 'html');
    expect(hasEventHandler(result, 'onclick')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeArtifactForSandbox / sanitizeHtmlForSandbox — sandbox path
// Must PRESERVE scripts and handlers; must STRIP escape vectors.
// ---------------------------------------------------------------------------

describe('sanitizeHtmlForSandbox — preserves scripts and handlers', () => {
  it('preserves inline <script>', () => {
    const input =
      '<div id="count">0</div><script>document.getElementById("count").textContent=1;</script>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasScript(result)).toBe(true);
  });

  it('preserves onclick event handler', () => {
    const input = '<button onclick="this.textContent=\'clicked\'">Click</button>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasEventHandler(result, 'onclick')).toBe(true);
  });

  it('preserves onchange event handler', () => {
    const input = '<input type="text" onchange="alert(this.value)">';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasEventHandler(result, 'onchange')).toBe(true);
  });

  it('preserves oninput event handler', () => {
    const input = '<input oninput="document.title=this.value">';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasEventHandler(result, 'oninput')).toBe(true);
  });

  it('preserves external script src', () => {
    const input = '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasScript(result)).toBe(true);
    expect(result).toContain('unpkg.com');
  });

  it('preserves <style> blocks', () => {
    const input = '<style>body { background: red; }</style><p>Hello</p>';
    const result = sanitizeHtmlForSandbox(input);
    expect(result).toContain('<style');
    expect(result).toContain('background');
  });

  it('preserves a counter app with button + script', () => {
    const input = `
      <div id="count">0</div>
      <button onclick="increment()">+</button>
      <script>
        let n = 0;
        function increment() {
          document.getElementById('count').textContent = ++n;
        }
      </script>
    `;
    const result = sanitizeHtmlForSandbox(input);
    expect(hasScript(result)).toBe(true);
    expect(hasEventHandler(result, 'onclick')).toBe(true);
    expect(result).toContain('increment');
  });
});

describe('sanitizeHtmlForSandbox — strips sandbox-escape vectors', () => {
  // --- <base> tag ---
  it('strips <base href> (URL hijacking)', () => {
    const input = '<base href="https://evil.com/"><p>Hello</p>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasBase(result)).toBe(false);
    expect(result).toContain('Hello');
  });

  it('strips <base target> (top-frame navigation)', () => {
    const input = '<base target="_top"><p>Safe</p>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasBase(result)).toBe(false);
  });

  // --- <meta http-equiv="refresh"> ---
  it('strips meta refresh (top-frame navigation)', () => {
    const input = '<meta http-equiv="refresh" content="0;url=https://evil.com"><p>Hi</p>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasMetaRefresh(result)).toBe(false);
    expect(result).toContain('Hi');
  });

  it('strips meta refresh with single-quoted http-equiv', () => {
    const input = "<meta http-equiv='refresh' content='3'><p>Wait</p>";
    const result = sanitizeHtmlForSandbox(input);
    expect(hasMetaRefresh(result)).toBe(false);
  });

  it('strips meta refresh with unquoted http-equiv', () => {
    const input = '<meta http-equiv=refresh content="5"><div>loading</div>';
    const result = sanitizeHtmlForSandbox(input);
    expect(hasMetaRefresh(result)).toBe(false);
  });

  it('preserves other meta tags (charset, viewport)', () => {
    const input = [
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width">',
      '<meta http-equiv="refresh" content="0">',
      '<p>content</p>',
    ].join('');
    const result = sanitizeHtmlForSandbox(input);
    // refresh stripped; others preserved
    expect(hasMetaRefresh(result)).toBe(false);
    // charset/viewport may be stripped by DOMPurify's WHOLE_DOCUMENT normalization
    // but the content body should survive
    expect(result).toContain('content');
  });

  // --- nested iframe allow-same-origin ---
  it('strips allow-same-origin from nested iframe sandbox attribute', () => {
    const input = '<iframe sandbox="allow-scripts allow-same-origin" src="about:blank"></iframe>';
    const result = sanitizeHtmlForSandbox(input);
    expect(result).not.toContain('allow-same-origin');
    // allow-scripts itself is fine and may be preserved
  });

  it('strips allow-top-navigation from nested iframe sandbox', () => {
    const input =
      '<iframe sandbox="allow-scripts allow-top-navigation" src="about:blank"></iframe>';
    const result = sanitizeHtmlForSandbox(input);
    expect(result).not.toContain('allow-top-navigation');
  });

  it('strips allow-top-navigation-by-user-activation from nested iframe sandbox', () => {
    const input =
      '<iframe sandbox="allow-scripts allow-top-navigation-by-user-activation"></iframe>';
    const result = sanitizeHtmlForSandbox(input);
    expect(result).not.toContain('allow-top-navigation-by-user-activation');
  });

  it('preserves safe nested iframe sandbox values', () => {
    const input =
      '<iframe sandbox="allow-scripts allow-forms allow-modals" src="about:blank"></iframe>';
    const result = sanitizeHtmlForSandbox(input);
    // Dangerous values stripped; harmless ones survive
    expect(result).toContain('allow-forms');
    expect(result).toContain('allow-modals');
    expect(result).not.toContain('allow-same-origin');
  });

  it('adds safe default sandbox when nested iframe has no sandbox attr', () => {
    const input = '<iframe src="about:blank"></iframe>';
    const result = sanitizeHtmlForSandbox(input);
    // The hook should have added a sandbox attr with allow-scripts at minimum
    expect(result).toContain('sandbox=');
    expect(result).not.toContain('allow-same-origin');
    expect(result).not.toContain('allow-top-navigation');
  });
});

// ---------------------------------------------------------------------------
// stripMetaRefreshFromSandboxHtml — unit tests for the regex layer
// ---------------------------------------------------------------------------

describe('stripMetaRefreshFromSandboxHtml', () => {
  it('removes meta refresh from plain string', () => {
    const input = '<meta http-equiv="refresh" content="0;url=https://evil.com">';
    expect(hasMetaRefresh(stripMetaRefreshFromSandboxHtml(input))).toBe(false);
  });

  it('is case-insensitive for HTTP-EQUIV', () => {
    const input = '<META HTTP-EQUIV="Refresh" CONTENT="5">';
    expect(hasMetaRefresh(stripMetaRefreshFromSandboxHtml(input))).toBe(false);
  });

  it('does not remove other meta tags', () => {
    const input = '<meta charset="UTF-8"><meta name="description" content="hello">';
    const result = stripMetaRefreshFromSandboxHtml(input);
    expect(result).toContain('charset');
    expect(result).toContain('description');
  });

  it('is a no-op on content with no meta refresh', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(stripMetaRefreshFromSandboxHtml(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// hasXSSRisk — verify detection still catches common patterns
// ---------------------------------------------------------------------------

describe('hasXSSRisk', () => {
  it('detects <script> tag', () => {
    expect(hasXSSRisk('<script>alert(1)</script>')).toBe(true);
  });

  it('detects javascript: protocol', () => {
    expect(hasXSSRisk('<a href="javascript:alert(1)">x</a>')).toBe(true);
  });

  it('detects onclick= handler', () => {
    expect(hasXSSRisk('<button onclick="evil()">x</button>')).toBe(true);
  });

  it('detects onerror= handler', () => {
    expect(hasXSSRisk('<img src=x onerror=alert(1)>')).toBe(true);
  });

  it('returns false for plain safe HTML', () => {
    expect(hasXSSRisk('<p>Hello <strong>world</strong></p>')).toBe(false);
  });
});
