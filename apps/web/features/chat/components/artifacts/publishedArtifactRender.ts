/**
 * Render policy for PUBLICLY published artifacts (CAP-015 slice 2).
 *
 * A published artifact is served at an unauthenticated URL to whoever holds the
 * token, so the render decision is a security decision, not a styling one. The
 * rule this module encodes:
 *
 *   - `html` / `react` / `mermaid` EXECUTE author-supplied script (mermaid via
 *     the mermaid runtime, which parses the published source). They are served
 *     ONLY through the existing sandbox pipeline — the cross-origin
 *     `NEXT_PUBLIC_SANDBOX_ORIGIN` renderer, or the null-origin `srcDoc`
 *     fallback (`sandbox="allow-scripts"` WITHOUT `allow-same-origin`). Both
 *     carry `connect-src 'none'`, so a published page cannot exfiltrate a
 *     viewer's data, and neither can reach the app origin's cookies or storage.
 *   - `svg` renders as an INERT `<img>` from a `data:` URL. An `<img>` cannot
 *     run script or fetch, which is why the SVG is not injected as markup even
 *     after `sanitizeSVG()`.
 *   - `markdown` / `text` / `code` are static text. Markdown goes through the
 *     same `MarkdownContent` chain the chat uses (rehype-raw → rehype-sanitize);
 *     text and code render as escaped preformatted source.
 *
 * The helpers live here (rather than inside the page component) so the branch
 * can be tested without mounting React or a DOM iframe.
 */

import type { ArtifactRenderPayload } from '@/lib/artifact-sandbox';
import {
  buildArtifactCspMeta,
  buildSandboxSrcDoc,
  escapeForInlineScript,
  escapeHTML,
  sanitizeSVG,
} from '@shared/utils/html-sanitizer';

/** The kinds a published page may serve. Mirrors migration 0095's CHECK. */
export type PublishedArtifactKind =
  | 'html'
  | 'react'
  | 'svg'
  | 'mermaid'
  | 'markdown'
  | 'text'
  | 'code';

/**
 * Kinds that MUST be rendered inside the sandboxed iframe.
 *
 * `mermaid` is here deliberately: rendering a diagram means running the mermaid
 * runtime over published source. Doing that on the app origin would execute a
 * third-party parser against attacker-influenced input inside the viewer's
 * authenticated session, so it stays behind the same frame as html/react.
 */
export const PUBLISHED_SANDBOX_KINDS: readonly PublishedArtifactKind[] = [
  'html',
  'react',
  'mermaid',
];

/** True when the kind must go through the sandbox frame, never inline. */
export function isSandboxedPublishedKind(kind: PublishedArtifactKind): boolean {
  return PUBLISHED_SANDBOX_KINDS.includes(kind);
}

/**
 * Payload posted to the cross-origin sandbox renderer.
 *
 * Identical in shape to the in-app ArtifactPreview path, so a published page
 * and the author's own preview render the artifact the same way.
 */
export function buildPublishedSandboxPayload(
  kind: PublishedArtifactKind,
  content: string,
): ArtifactRenderPayload {
  switch (kind) {
    case 'html':
      return { type: 'render', kind: 'html', html: buildSandboxSrcDoc(content), runScripts: true };
    case 'react':
      return { type: 'render', kind: 'react', code: content };
    case 'mermaid':
      return { type: 'render', kind: 'mermaid', code: content };
    default:
      // Non-scripted kinds never reach the frame; if one somehow does, ship it
      // as inert text rather than promoting it into an executing branch.
      return { type: 'render', kind: 'text', text: content };
  }
}

/**
 * The null-origin `srcDoc` used when `NEXT_PUBLIC_SANDBOX_ORIGIN` is unset or
 * unreachable. Every document carries the shared artifact CSP
 * (`connect-src 'none'`, CDN-pinned `script-src`).
 */
export function buildPublishedFallbackSrcDoc(kind: PublishedArtifactKind, content: string): string {
  switch (kind) {
    case 'html':
      // Already a complete document with the CSP meta injected — never wrap it
      // again (double-wrapping is what broke script execution pre-ART-1).
      return buildSandboxSrcDoc(content);

    case 'react':
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${buildArtifactCspMeta()}
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel" data-presets="env,react">
${escapeForInlineScript(content)}
;var __AgiApp = (typeof App !== 'undefined' && App) || (typeof Component !== 'undefined' && Component);
if (__AgiApp) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__AgiApp));
}
    </script>
  </body>
</html>`;

    case 'mermaid':
      // AUDIT-FIX ART-6 parity: the diagram source is HTML-escaped before it
      // reaches the document. Mermaid reads the element's TEXT, so escaping is
      // lossless while markup in the source stays inert.
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });</script>
  </head>
  <body>
    <div class="mermaid">
      ${escapeHTML(content)}
    </div>
  </body>
</html>`;

    default:
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <style>
      body { margin: 0; padding: 16px; font-family: monospace; white-space: pre-wrap; }
    </style>
  </head>
  <body>${escapeHTML(content)}</body>
</html>`;
  }
}

/**
 * Inert `<img>` source for a published SVG, or `null` when sanitisation left
 * nothing renderable.
 *
 * A `data:` URL in an `<img>` cannot execute script, run `<foreignObject>`
 * handlers, or issue requests — which is exactly why the sanitised markup is
 * NOT injected into the page instead. `encodeURIComponent` (not `btoa`) is used
 * so non-Latin-1 characters in the SVG survive.
 */
export function buildPublishedSvgImageSrc(content: string): string | null {
  const sanitized = sanitizeSVG(content).trim();
  if (!sanitized) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`;
}
