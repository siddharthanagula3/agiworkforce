/**
 * artifact-sandbox — shared CSP + HTML wrapping for sandboxed artifact previews.
 *
 * Both `ArtifactPanel` and `ArtifactRenderer.HtmlArtifact` consume this so the
 * sandbox attribute, CSP meta, and base styles cannot drift between the two
 * surfaces. Round-2 audit P0 #9 (Artifacts live preview, 2026-05-21).
 */

export const ARTIFACT_SANDBOX_ATTR = 'allow-scripts allow-modals';

// AUDIT-FIX ART-6 / ART-14: the artifact CSP, identical on every renderer.
//
// This package cannot import from `apps/web`, so these directives are MIRRORED
// byte-for-byte by `buildArtifactCspContent()` in
// `apps/web/shared/utils/html-sanitizer.ts` (which the web sandbox srcDoc,
// ArtifactPreview's react/svg/mermaid/text documents and ArtifactBlock all
// consume). Edit the two together — that file carries the full rationale for
// each directive, in particular why `'self'` must never appear: in a
// null-origin sandbox it matches nothing and browsers have been observed to
// drop the artifact's inline scripts as a result.
//
// Changes from the previous value here:
//   - `default-src 'self' blob: data:` → `'none'` (`'self'` was inert anyway;
//     every resource type is now enumerated explicitly).
//   - `script-src` gains the fixed CDN allowlist, so an HTML artifact that
//     bootstraps React/mermaid/Tailwind from a CDN renders on this surface
//     exactly as it does on web instead of silently losing its scripts.
//   - added `media-src`, `child-src`, `base-uri` and `form-action`.
const ARTIFACT_SCRIPT_CDN_HOSTS = [
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://esm.sh',
] as const;

export const ARTIFACT_CSP_CONTENT = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${ARTIFACT_SCRIPT_CDN_HOSTS.join(' ')}`,
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'font-src data: https:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP_CONTENT}">`;

const BASE_STYLES =
  `<style>` +
  `* { box-sizing: border-box; } ` +
  `:root { color-scheme: light dark; } ` +
  `body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: CanvasText; background: Canvas; } ` +
  `</style>`;

// CSP <meta> tags are stripped in two ReDoS-free passes. The only regex applied
// to (untrusted) artifact content is META_TAG_PATTERN, whose single unbounded
// quantifier `[^>]*` is hard-anchored by `>` — linear, the canonical safe form.
// The CSP check then uses plain substring `.includes()` (no quantifier, so no
// polynomial backtracking is possible) instead of a regex over the matched tag.
// An earlier `\s*["']?\s*content-security-policy` form put two `\s*` adjacent
// whenever the optional quote was absent — that is the polynomial CodeQL
// (correctly) flagged.
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;

function stripCspMetaTags(content: string): string {
  return content.replace(META_TAG_PATTERN, (tag) => {
    const lower = tag.toLowerCase();
    return lower.includes('http-equiv') && lower.includes('content-security-policy') ? '' : tag;
  });
}

function injectHeadContent(documentHtml: string, headContent: string): string {
  if (/<head\b[^>]*>/i.test(documentHtml)) {
    return documentHtml.replace(/<head\b[^>]*>/i, (match) => `${match}\n${headContent}`);
  }

  if (/<html\b[^>]*>/i.test(documentHtml)) {
    return documentHtml.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${headContent}</head>`);
  }

  // Neither <head> nor <html>, but buildSandboxedHtml already classified this as
  // a full document — a bare `<!doctype html>` followed by markup does that.
  // Prepending here left the CSP <meta> outside <head>, and a CSP delivered
  // outside <head> is IGNORED OUTRIGHT by browsers: the sandbox then executed
  // model-generated code with no policy at all, silently, with only a console
  // message to show for it. Build a real head so the meta is always inside one.
  const doctype = documentHtml.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '';
  const body = documentHtml.slice(doctype.length);
  return `${doctype}<html><head>${headContent}</head><body>${body}</body></html>`;
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
