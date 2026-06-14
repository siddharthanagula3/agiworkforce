/**
 * artifact-sandbox — shared CSP + HTML wrapping for sandboxed artifact previews.
 *
 * Both `ArtifactPanel` and `ArtifactRenderer.HtmlArtifact` consume this so the
 * sandbox attribute, CSP meta, and base styles cannot drift between the two
 * surfaces. Round-2 audit P0 #9 (Artifacts live preview, 2026-05-21).
 */

export const ARTIFACT_SANDBOX_ATTR = 'allow-scripts allow-modals';

const CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; ` +
  `script-src 'unsafe-inline' 'unsafe-eval'; ` +
  `style-src 'unsafe-inline' *; ` +
  `img-src * data: blob:; ` +
  `font-src * data:; ` +
  `connect-src 'none'; ` +
  `frame-src 'none'; ` +
  `object-src 'none';">`;

const BASE_STYLES =
  `<style>` +
  `* { box-sizing: border-box; } ` +
  `:root { color-scheme: light dark; } ` +
  `body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: CanvasText; background: Canvas; } ` +
  `</style>`;

// CSP <meta> tags are stripped in two linear passes to avoid ReDoS. A single
// regex like `<meta\s+[^>]*http-equiv...` places two unbounded quantifiers over
// overlapping classes (whitespace is a subset of non-`>`) next to each other,
// which CodeQL flags as js/polynomial-redos (hostile input: `<meta ` followed
// by many spaces). Here the only `*` is `[^>]*>` — a single quantifier
// hard-anchored by `>`, so it backtracks linearly — and the CSP attribute test
// runs once per already-bounded tag.
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const CSP_HTTP_EQUIV_PATTERN = /http-equiv\s*=\s*["']?\s*content-security-policy\b/i;

function stripCspMetaTags(content: string): string {
  return content.replace(META_TAG_PATTERN, (tag) => (CSP_HTTP_EQUIV_PATTERN.test(tag) ? '' : tag));
}

function injectHeadContent(documentHtml: string, headContent: string): string {
  if (/<head\b[^>]*>/i.test(documentHtml)) {
    return documentHtml.replace(/<head\b[^>]*>/i, (match) => `${match}\n${headContent}`);
  }

  if (/<html\b[^>]*>/i.test(documentHtml)) {
    return documentHtml.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${headContent}</head>`);
  }

  return `${headContent}${documentHtml}`;
}

/**
 * Wrap raw HTML artifact content in a fully-formed document with our CSP meta
 * tag and base styles. If the artifact already supplies a full document (has
 * `<!doctype` or `<html>`), inject the CSP into its `<head>` only when not
 * already present. Otherwise build a minimal shell.
 *
 * The returned string is intended to be passed to an `<iframe srcDoc>` with
 * `sandbox={ARTIFACT_SANDBOX_ATTR}` and `referrerPolicy="no-referrer"`.
 */
export function buildSandboxedHtml(content: string): string {
  const isFullDocument = /<html[\s>]/i.test(content) || /<!doctype/i.test(content);

  if (isFullDocument) {
    return injectHeadContent(stripCspMetaTags(content), CSP_META);
  }

  return (
    `<!DOCTYPE html><html lang="en"><head>` +
    `<meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `${CSP_META}${BASE_STYLES}` +
    `</head><body>${content}</body></html>`
  );
}

export const __ARTIFACT_SANDBOX_INTERNALS = { CSP_META, BASE_STYLES };
