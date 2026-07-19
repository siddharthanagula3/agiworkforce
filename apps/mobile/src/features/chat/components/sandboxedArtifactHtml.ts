/**
 * Pure builder for the hardened artifact-preview document. Kept free of any
 * native (WebView) import so it is unit-testable in isolation. Rendered by
 * {@link SafeArtifactPreview} in a JS-disabled WebView.
 */
export type PreviewableKind = 'html' | 'svg' | 'mermaid';

/** Pinned mermaid version served from jsDelivr; the only external origin the
 *  mermaid sandbox's CSP permits. */
const MERMAID_CDN = 'https://cdn.jsdelivr.net';
const MERMAID_SRC_URL = `${MERMAID_CDN}/npm/mermaid@11/dist/mermaid.min.js`;

/**
 * Build the mermaid-preview document. The UNTRUSTED diagram source is injected
 * as a JSON string literal (via JSON.stringify) — it is DATA, never interpolated
 * as HTML/JS — and rendered by the trusted, pinned mermaid library in
 * `securityLevel: 'strict'` (which sanitizes diagram labels). The rendering
 * WebView enables JS ONLY for this document and exposes NO RN bridge, so even a
 * hypothetical escape is confined to the WebView. CSP permits scripts solely
 * from the pinned mermaid CDN.
 */
export function buildMermaidPreviewHtml(source: string): string {
  // JSON.stringify does NOT escape `<`, so a literal `</script>` inside the diagram
  // source would prematurely close the <script> block and break out into HTML.
  // Escape `<` to `<` (decodes back to `<` as a string value) to keep the
  // untrusted source strictly inside the data literal.
  const encoded = JSON.stringify(source).replace(/</g, '\\u003c');
  const csp = `default-src 'none'; script-src ${MERMAID_CDN} 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;`;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<style>html,body{margin:0;padding:12px;background:#ffffff;}#c{display:flex;justify-content:center;}</style>',
    '</head><body>',
    '<div id="c"></div>',
    `<script src="${MERMAID_SRC_URL}"></script>`,
    '<script>',
    `var src = ${encoded};`,
    'try {',
    "  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });",
    "  mermaid.render('d', src).then(function(r){ document.getElementById('c').innerHTML = r.svg; })",
    "    .catch(function(){ document.getElementById('c').textContent = 'Could not render this diagram.'; });",
    "} catch (e) { document.getElementById('c').textContent = 'Could not render this diagram.'; }",
    '</script>',
    '</body></html>',
  ].join('');
}

const CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:;";

/**
 * Wrap untrusted artifact content in a self-contained document whose CSP
 * neutralizes external loads (and, together with the WebView's disabled
 * JavaScript, any embedded scripts). For `html` the content is placed in the
 * body; inner `<html>/<head>/<body>` tags the model emitted are ignored by the
 * parser, and OUR head/CSP governs the document.
 */
export function buildSandboxedArtifactHtml(content: string, kind: PreviewableKind): string {
  const body = kind === 'svg' ? `<div>${content}</div>` : content;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
    '<style>',
    'html,body{margin:0;padding:12px;background:#ffffff;color:#111111;',
    'font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;line-height:1.5;}',
    'img,svg,video,table{max-width:100%;height:auto;}',
    'pre{white-space:pre-wrap;word-break:break-word;}',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('');
}
