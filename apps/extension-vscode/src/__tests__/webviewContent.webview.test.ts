/**
 * webviewContent.webview.test.ts — jsdom-based smoke + security tests
 * for the rendered webview HTML produced by getWebviewContent().
 *
 * Catches F-01-class bugs (TS syntax leaking into the webview JS string
 * body causes the entire script to fail at parse time, breaking the
 * sidebar chat panel) and F-02-class bugs (CSP misconfiguration that
 * would allow inline scripts or third-party domains).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { getWebviewContent } from '../providers/sidebar/webviewContent';

// Build a minimal stub for the `webview` parameter that getWebviewContent
// requires. We only need `cspSource` and `asWebviewUri` to return Uri-like.
function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function render(): string {
  // The webview/uri parameters are constructed structurally above; cast
  // through `unknown` to bridge the local stub shape to the imported
  // vscode types without depending on the real vscode runtime.
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
  );
}

describe('getWebviewContent — F-01 regression: script must parse without SyntaxError', () => {
  it('every <script> tag body is valid JavaScript', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script')).filter(
      (s) => s.textContent && s.textContent.trim().length > 0,
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const body = script.textContent ?? '';
      // Use the Function constructor to parse; throws SyntaxError on bad JS.
      // Wrap in `() => { ... }` so top-level returns don't trip it.
      expect(() => new Function(body)).not.toThrow();
    }
  });

  it('does not contain TypeScript "as" cast syntax in script bodies', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script')).filter(
      (s) => s.textContent && s.textContent.trim().length > 0,
    );
    for (const script of scripts) {
      const body = script.textContent ?? '';
      // The specific F-01 footprint plus other common cast targets.
      expect(body).not.toMatch(
        /\bas\s+HTML(?:Option|Div|Button|Input|TextArea|Select|Anchor)Element\b/,
      );
      expect(body).not.toMatch(/\bas\s+Record\s*</);
    }
  });
});

describe('getWebviewContent — CSP', () => {
  it('declares default-src none', () => {
    const html = render();
    expect(html).toMatch(/default-src\s+'none'/);
  });

  it('script-src uses nonce', () => {
    const html = render();
    expect(html).toMatch(/script-src[^;]*'nonce-test-nonce-base64url-32-chars-abcdef'/);
  });

  it('does not allow unsafe-inline scripts', () => {
    const html = render();
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(html).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it('img-src restricts to cspSource, https, and data', () => {
    const html = render();
    // Matches "img-src vscode-webview://mock https: data:" — verify the host
    // allowlist limit (no wildcard).
    expect(html).toMatch(/img-src[^;]*vscode-webview:\/\/mock/);
    expect(html).not.toMatch(/img-src[^;]*\*/);
  });
});

describe('getWebviewContent — structural smoke', () => {
  it('contains the chat input and send button', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('#userInput')).not.toBeNull();
    expect(doc.querySelector('#sendBtn')).not.toBeNull();
  });

  it('nonce is present on style and script tags', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'));
    const scripts = Array.from(doc.querySelectorAll('script'));
    for (const el of [...styles, ...scripts]) {
      expect(el.getAttribute('nonce')).toBe('test-nonce-base64url-32-chars-abcdef');
    }
  });
});
