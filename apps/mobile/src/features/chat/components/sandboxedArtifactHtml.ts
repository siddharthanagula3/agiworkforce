/**
 * Pure builder for the hardened artifact-preview document. Kept free of any
 * native (WebView) import so it is unit-testable in isolation. Rendered by
 * {@link SafeArtifactPreview} in a JS-disabled WebView.
 */
export type PreviewableKind = 'html' | 'svg';

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
