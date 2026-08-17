import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SEC-19. The artifact sandbox is its own origin, so whatever executes in it
 * defines the whole trust boundary. A CDN runtime loaded from a floating
 * version range, or pinned but unverified, lets a compromised CDN response run
 * arbitrary code there. Every CDN script must carry an exact version and a
 * Subresource Integrity hash, as the DOMPurify tag already did.
 */

const SANDBOX_HTML = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'infrastructure', 'sandbox', 'index.html'),
  'utf8',
);

const CDN_SCRIPT_URL = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)\/[^\s'"]+\.m?js\b/g;
const EXACT_VERSION = /@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\//;

function cdnScriptUrls(): { url: string; index: number }[] {
  return [...SANDBOX_HTML.matchAll(CDN_SCRIPT_URL)].map((m) => ({
    url: m[0],
    index: m.index ?? 0,
  }));
}

describe('artifact sandbox CDN runtime integrity', () => {
  it('loads React, ReactDOM, Babel, mermaid and DOMPurify from a CDN', () => {
    const urls = cdnScriptUrls().map((u) => u.url);
    for (const pkg of ['react@', 'react-dom@', '@babel/standalone@', 'mermaid@', 'dompurify@']) {
      expect(urls.some((u) => u.includes(pkg))).toBe(true);
    }
  });

  it('pins every CDN script to an exact version', () => {
    const floating = cdnScriptUrls()
      .filter(({ url }) => !EXACT_VERSION.test(url))
      .map(({ url }) => url);

    expect(floating, `floating CDN version ranges cannot be covered by an SRI hash`).toEqual([]);
  });

  it('carries a subresource integrity hash for every CDN script', () => {
    const unverified = cdnScriptUrls()
      .filter(({ url, index }) => {
        const declaration = SANDBOX_HTML.slice(index, index + 200);
        return !/integrity[=:]\s*['"]sha(?:256|384|512)-/.test(declaration) && Boolean(url);
      })
      .map(({ url }) => url);

    expect(unverified, `CDN script loaded without an integrity attribute`).toEqual([]);
  });

  it('assigns integrity alongside src on every dynamically created script', () => {
    const assignments = [...SANDBOX_HTML.matchAll(/(\w+)\.src\s*=\s*[^;]+;/g)];
    expect(assignments.length).toBeGreaterThan(0);

    for (const match of assignments) {
      const varName = match[1]!;
      const block = SANDBOX_HTML.slice(match.index ?? 0, (match.index ?? 0) + 300);
      expect(block).toMatch(new RegExp(`\\b${varName}\\.integrity\\s*=`));
    }
  });

  it('does not import a CDN module, which cannot carry an integrity attribute', () => {
    expect(SANDBOX_HTML).not.toMatch(/\bimport\b[^\n]*['"]https:\/\//);
  });
});
