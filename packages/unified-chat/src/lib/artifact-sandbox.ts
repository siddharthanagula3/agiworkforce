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
  `body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: #e4e4e7; background: #18181b; } ` +
  `</style>`;

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
    if (/<meta[^>]*content-security-policy/i.test(content)) {
      return content;
    }
    return content.replace(/<head([^>]*)>/i, `<head$1>\n${CSP_META}`);
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
