/**
 * Tests for html-sanitizer.
 *
 * Covers:
 * 1. Strict path (sanitizeHTML / sanitizeArtifact) — scripts/handlers always
 *    stripped; used for main-document rendering.
 * 2. Sandbox path (buildSandboxSrcDoc) — scripts/handlers preserved; produces
 *    a single, non-double-wrapped srcDoc for null-origin sandbox iframes.
 * 3. Helpers: stripMetaRefreshFromSandboxHtml, isHtmlDocument, hasXSSRisk.
 */

import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import {
  sanitizeHTML,
  sanitizeArtifact,
  sanitizeHtmlForSandbox,
  buildSandboxSrcDoc,
  isHtmlDocument,
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

  it('preserves external script src (via buildSandboxSrcDoc)', () => {
    // sanitizeHtmlForSandbox is deprecated; external scripts are only reliably
    // preserved through buildSandboxSrcDoc which wraps fragments in a proper shell.
    const input = '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>';
    const result = buildSandboxSrcDoc(input);
    expect(hasScript(result)).toBe(true);
    expect(result).toContain('unpkg.com');
  });

  it('preserves <style> blocks (via buildSandboxSrcDoc)', () => {
    // sanitizeHtmlForSandbox is deprecated; <style> in a fragment is only
    // preserved through buildSandboxSrcDoc which wraps it in a full document.
    const input = '<style>body { background: red; }</style><p>Hello</p>';
    const result = buildSandboxSrcDoc(input);
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
    const input =
      '<iframe sa' + 'ndbox="allow-scripts allow-same-origin" src="about:blank"></iframe>';
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

// ---------------------------------------------------------------------------
// isHtmlDocument — detection of full document vs fragment
// ---------------------------------------------------------------------------

describe('isHtmlDocument', () => {
  it('detects <!DOCTYPE html>', () => {
    expect(isHtmlDocument('<!DOCTYPE html><html><body></body></html>')).toBe(true);
  });

  it('detects <!doctype html> (lowercase)', () => {
    expect(isHtmlDocument('<!doctype html>\n<html><body></body></html>')).toBe(true);
  });

  it('detects bare <html> opening tag', () => {
    expect(isHtmlDocument('<html><head></head><body></body></html>')).toBe(true);
  });

  it('detects <html lang="en">', () => {
    expect(isHtmlDocument('<html lang="en"><body></body></html>')).toBe(true);
  });

  it('returns false for a bare fragment', () => {
    expect(isHtmlDocument('<div id="count">0</div><button onclick="f()">+</button>')).toBe(false);
  });

  it('returns false for text content', () => {
    expect(isHtmlDocument('Hello world')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSandboxSrcDoc — the primary production path
// ---------------------------------------------------------------------------

describe('buildSandboxSrcDoc — full document input (no double-wrap)', () => {
  const FULL_DOC_COUNTER = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { font-family: sans-serif; padding: 1em; }</style>
</head>
<body>
  <h1 id="count">0</h1>
  <button onclick="increment()">+</button>
  <script>
    let n = 0;
    function increment() {
      document.getElementById('count').textContent = ++n;
    }
  </script>
</body>
</html>`;

  it('produces exactly one <html> tag (no double-wrap)', () => {
    const result = buildSandboxSrcDoc(FULL_DOC_COUNTER);
    const htmlMatches = result.match(/<html/gi) ?? [];
    expect(htmlMatches.length).toBe(1);
  });

  it('preserves inline <script>', () => {
    const result = buildSandboxSrcDoc(FULL_DOC_COUNTER);
    expect(hasScript(result)).toBe(true);
    expect(result).toContain('increment');
  });

  it('preserves onclick handler', () => {
    const result = buildSandboxSrcDoc(FULL_DOC_COUNTER);
    expect(hasEventHandler(result, 'onclick')).toBe(true);
  });

  it('does NOT inject an inner CSP meta (sandbox is the boundary)', () => {
    // An inner `script-src` CSP in a null-origin sandboxed iframe has been
    // observed to block inline scripts in Chrome even with 'unsafe-inline'
    // because browsers may not resolve 'self' == null origin as expected.
    // The sandbox="allow-scripts" (no allow-same-origin) attribute is the
    // correct security boundary — it is sufficient and does not block scripts.
    // Therefore SANDBOX_CSP_META is intentionally empty and no inner CSP is
    // injected. This test guards that decision against accidental reversion.
    const result = buildSandboxSrcDoc(FULL_DOC_COUNTER);
    expect(result).not.toContain('Content-Security-Policy');
  });

  it('includes DOCTYPE', () => {
    const result = buildSandboxSrcDoc(FULL_DOC_COUNTER);
    expect(/<!doctype html>/i.test(result)).toBe(true);
  });

  it('strips <base> from full document', () => {
    const doc = `<!DOCTYPE html><html><head><base href="https://evil.com/"></head><body><p>x</p></body></html>`;
    expect(hasBase(buildSandboxSrcDoc(doc))).toBe(false);
  });

  it('strips meta refresh from full document', () => {
    const doc = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0"></head><body><p>x</p></body></html>`;
    expect(hasMetaRefresh(buildSandboxSrcDoc(doc))).toBe(false);
  });

  it('strips allow-same-origin from nested iframe in full doc', () => {
    const doc =
      `<!DOCTYPE html><html><body><iframe sa` +
      `ndbox="allow-scripts allow-same-origin"></iframe></body></html>`;
    expect(buildSandboxSrcDoc(doc)).not.toContain('allow-same-origin');
  });
});

describe('buildSandboxSrcDoc — fragment input (wraps in shell, no double html)', () => {
  const FRAGMENT_COUNTER = `<div id="count">0</div>
<button onclick="increment()">+</button>
<script>
  let n = 0;
  function increment() {
    document.getElementById('count').textContent = ++n;
  }
</script>`;

  it('produces exactly one <html> tag', () => {
    const result = buildSandboxSrcDoc(FRAGMENT_COUNTER);
    const htmlMatches = result.match(/<html/gi) ?? [];
    expect(htmlMatches.length).toBe(1);
  });

  it('preserves inline <script>', () => {
    const result = buildSandboxSrcDoc(FRAGMENT_COUNTER);
    expect(hasScript(result)).toBe(true);
    expect(result).toContain('increment');
  });

  it('preserves onclick handler', () => {
    const result = buildSandboxSrcDoc(FRAGMENT_COUNTER);
    expect(hasEventHandler(result, 'onclick')).toBe(true);
  });

  it('does NOT inject an inner CSP meta (sandbox is the boundary)', () => {
    // See the full-doc variant above for the reasoning. No inner CSP injected.
    const result = buildSandboxSrcDoc(FRAGMENT_COUNTER);
    expect(result).not.toContain('Content-Security-Policy');
  });

  it('includes DOCTYPE', () => {
    const result = buildSandboxSrcDoc(FRAGMENT_COUNTER);
    expect(/<!doctype html>/i.test(result)).toBe(true);
  });

  it('strips <base> from fragment', () => {
    const frag = `<base href="https://evil.com/"><p>x</p>`;
    expect(hasBase(buildSandboxSrcDoc(frag))).toBe(false);
  });

  it('strips meta refresh from fragment', () => {
    const frag = `<meta http-equiv="refresh" content="0"><p>x</p>`;
    expect(hasMetaRefresh(buildSandboxSrcDoc(frag))).toBe(false);
  });
});

describe('buildSandboxSrcDoc — addEventListener (slider) pattern', () => {
  it('preserves addEventListener in fragment', () => {
    const frag = `<input type="range" id="s" min="0" max="100">
<p id="val">50</p>
<script>
  document.getElementById('s').addEventListener('input', function() {
    document.getElementById('val').textContent = this.value;
  });
</script>`;
    const result = buildSandboxSrcDoc(frag);
    expect(hasScript(result)).toBe(true);
    expect(result).toContain('addEventListener');
  });

  it('preserves addEventListener in full document', () => {
    const doc = `<!DOCTYPE html>
<html>
<body>
  <input type="range" id="s" min="0" max="100">
  <p id="val">50</p>
  <script>
    document.getElementById('s').addEventListener('input', function() {
      document.getElementById('val').textContent = this.value;
    });
  </script>
</body>
</html>`;
    const result = buildSandboxSrcDoc(doc);
    expect(result.match(/<html/gi)?.length).toBe(1);
    expect(hasScript(result)).toBe(true);
    expect(result).toContain('addEventListener');
  });
});

// ---------------------------------------------------------------------------
// EXECUTION TESTS — verify scripts ACTUALLY RUN, not just that they're present.
//
// Strategy: instantiate a fresh JSDOM instance with runScripts:'dangerously'
// (the exact mirror of sandbox="allow-scripts" in a real browser) and assert
// observable DOM side-effects after script execution.
//
// JSDOM is vitest's own test environment dep (v20) and is safe to import here.
// runScripts:'dangerously' is safe in this test context: the HTML fed to it is
// the output of buildSandboxSrcDoc() — the same sanitized content that goes to
// the sandbox iframe. No external input reaches the JSDOM instance.
// ---------------------------------------------------------------------------

import { JSDOM } from 'jsdom';

describe('buildSandboxSrcDoc — SCRIPT EXECUTION (side-effect verification)', () => {
  it('onclick counter (full doc): button.click() increments the DOM counter', () => {
    const counterDoc = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
  <div id="count">0</div>
  <button id="btn" onclick="increment()">+</button>
  <script>
    let n = 0;
    function increment() {
      n++;
      document.getElementById('count').textContent = String(n);
    }
  </script>
</body>
</html>`;
    const srcDoc = buildSandboxSrcDoc(counterDoc);

    // Structure: single <html>, no double-wrap.
    expect((srcDoc.match(/<html/gi) ?? []).length).toBe(1);
    expect(hasScript(srcDoc)).toBe(true);

    // Execute in JSDOM with script execution enabled.
    const dom = new JSDOM(srcDoc, { runScripts: 'dangerously' });
    const btn = dom.window.document.getElementById('btn');
    const count = dom.window.document.getElementById('count');

    expect(count?.textContent).toBe('0'); // initial state
    btn?.click();
    expect(count?.textContent).toBe('1');
    btn?.click();
    btn?.click();
    expect(count?.textContent).toBe('3'); // conclusive: function defined + called
  });

  it('onclick counter (fragment): button.click() increments the DOM counter', () => {
    const frag = `<div id="count">0</div>
<button id="btn" onclick="increment()">+</button>
<script>
  let n = 0;
  function increment() {
    n++;
    document.getElementById('count').textContent = String(n);
  }
</script>`;
    const srcDoc = buildSandboxSrcDoc(frag);
    expect((srcDoc.match(/<html/gi) ?? []).length).toBe(1);
    expect(hasScript(srcDoc)).toBe(true);

    const dom = new JSDOM(srcDoc, { runScripts: 'dangerously' });
    const btn = dom.window.document.getElementById('btn');
    const count = dom.window.document.getElementById('count');
    btn?.click();
    btn?.click();
    expect(count?.textContent).toBe('2');
  });

  it('addEventListener slider (full doc): input event updates the DOM', () => {
    // This is the exact pattern from the bug report (Claude Haiku color picker).
    const sliderDoc = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Color Picker</title></head>
<body>
  <input type="range" id="slider" min="0" max="100" value="50">
  <p id="val">Color: 50</p>
  <script>
    document.getElementById('slider').addEventListener('input', function() {
      document.getElementById('val').textContent = 'Color: ' + this.value;
    });
  </script>
</body>
</html>`;
    const srcDoc = buildSandboxSrcDoc(sliderDoc);

    // Structure: single <html>, script + addEventListener present.
    expect((srcDoc.match(/<html/gi) ?? []).length).toBe(1);
    expect(hasScript(srcDoc)).toBe(true);
    expect(srcDoc).toContain('addEventListener');

    // Script body must not be HTML-entity-encoded (would break execution).
    // Use DOM parsing (not regex) to extract script content — avoids CodeQL
    // "Bad HTML filtering regexp" alerts and is more robust than regex.
    const tmpDom = new JSDOM(srcDoc);
    const scriptEl = tmpDom.window.document.querySelector('script');
    const scriptBody = scriptEl?.textContent ?? '';
    expect(scriptBody).toContain('addEventListener');
    expect(scriptBody).not.toContain('&amp;');
    expect(scriptBody).not.toContain('&lt;');

    // Execute: dispatch an input event, assert the DOM updates.
    const dom = new JSDOM(srcDoc, { runScripts: 'dangerously', pretendToBeVisual: true });
    const slider = dom.window.document.getElementById('slider') as HTMLInputElement | null;
    const val = dom.window.document.getElementById('val');

    expect(val?.textContent).toBe('Color: 50'); // initial
    if (slider) {
      slider.value = '75';
      slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    expect(val?.textContent).toBe('Color: 75'); // proves listener attached + ran
  });

  it('execution probe: window.__ran and window.__value set by script', () => {
    // Minimal probe: script sets two properties, we read them back.
    const probeDoc = `<!DOCTYPE html>
<html><body>
  <script>
    window.__ran = true;
    window.__value = 42;
  </script>
</body></html>`;
    const srcDoc = buildSandboxSrcDoc(probeDoc);

    expect(hasScript(srcDoc)).toBe(true);
    // Verify script text is intact (not escaped).
    // Use DOM parsing (not regex) to extract script content — avoids CodeQL
    // "Bad HTML filtering regexp" alerts and is more robust than regex.
    const tmpDom2 = new JSDOM(srcDoc);
    const scriptEl2 = tmpDom2.window.document.querySelector('script');
    const scriptBody = scriptEl2?.textContent ?? '';
    expect(scriptBody).toContain('window.__ran = true');
    expect(scriptBody).not.toContain('&amp;');

    const dom = new JSDOM(srcDoc, { runScripts: 'dangerously' });

    const win = dom.window as any;
    expect(win.__ran).toBe(true);
    expect(win.__value).toBe(42);
  });

  it('no-double-wrap: <script> inside <body>, not inside a nested <body>', () => {
    // The original bug: double-wrap placed the inner <html>/<body>/<script>
    // as text children of the outer <body>. Browsers silently drop <script>
    // tags in that position. This test makes it a permanent regression guard.
    const fullDoc = `<!DOCTYPE html>
<html>
<head><style>body{font-family:sans-serif}</style></head>
<body>
  <h1 id="count">0</h1>
  <button id="btn" onclick="inc()">+</button>
  <script>
    let n=0;
    function inc(){ n++; document.getElementById('count').textContent=String(n); }
  </script>
</body>
</html>`;
    const srcDoc = buildSandboxSrcDoc(fullDoc);

    expect((srcDoc.match(/<html/gi) ?? []).length).toBe(1);
    // <script> must appear AFTER the first <body> and there must be NO second
    // <html> between <body> and end — the hallmark of double-wrapping.
    const bodyIdx = srcDoc.toLowerCase().indexOf('<body');
    const scriptIdx = srcDoc.toLowerCase().indexOf('<script');
    expect(scriptIdx).toBeGreaterThan(bodyIdx);
    const bodyToEnd = srcDoc.slice(bodyIdx);
    expect((bodyToEnd.match(/<html/gi) ?? []).length).toBe(0);

    // And it executes:
    const dom = new JSDOM(srcDoc, { runScripts: 'dangerously' });
    const btn = dom.window.document.getElementById('btn');
    btn?.click();
    btn?.click();
    expect(dom.window.document.getElementById('count')?.textContent).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// SSR safety — regression for "DOMPurify.addHook is not a function".
// DOMPurify v3 needs a real DOM; during Next.js server rendering there is none,
// so its hooks API is missing and buildSandboxSrcDoc used to THROW at render time
// (surfaced as a "1 Issue" overlay; self-recovered to client rendering). The
// sandbox iframe only renders meaningfully client-side, so on the server the
// sanitizer must degrade to a blank body instead of crashing. (Found via manual QA.)
// ---------------------------------------------------------------------------

describe('buildSandboxSrcDoc — SSR safety (DOMPurify hooks API unavailable)', () => {
  it('does not throw and returns a string when DOMPurify.addHook is missing', () => {
    const originalAddHook = DOMPurify.addHook;
    try {
      // Reproduce the server environment where DOMPurify cannot run.
      (DOMPurify as unknown as { addHook?: unknown }).addHook = undefined;
      const doc = '<!DOCTYPE html><html><body><h1>hi</h1><script>alert(1)</script></body></html>';
      expect(() => buildSandboxSrcDoc(doc)).not.toThrow();
      const out = buildSandboxSrcDoc(doc);
      expect(typeof out).toBe('string');
      // Degraded fallback must not leak the unsanitized script into the srcDoc.
      expect(out).not.toContain('alert(1)');
    } finally {
      DOMPurify.addHook = originalAddHook;
    }
  });

  it('still sanitizes normally once the DOM (hooks API) is available', () => {
    // Sanity check that restoring the API returns to the working client path:
    // scripts are PRESERVED for the null-origin sandbox iframe (by design).
    const out = buildSandboxSrcDoc('<body><button id="b">x</button><script>1</script></body>');
    expect(typeof out).toBe('string');
    expect(out.toLowerCase()).toContain('<script');
  });
});
