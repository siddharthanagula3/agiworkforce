/**
 * Pure builder for the hardened artifact-preview document. Kept free of any
 * native (WebView) import so it is unit-testable in isolation. Rendered by
 * {@link SafeArtifactPreview} in a JS-disabled WebView.
 */
import { lightColors } from '@/src/ui/theme/tokens';

export type PreviewableKind = 'html' | 'svg' | 'mermaid';

const PREVIEW_SURFACE = lightColors.background;
const PREVIEW_TEXT = lightColors.textPrimary;

const MERMAID_CDN = 'https://cdn.jsdelivr.net';
const MERMAID_SRC_URL = `${MERMAID_CDN}/npm/mermaid@11/dist/mermaid.min.js`;

export function buildMermaidPreviewHtml(source: string): string {
  const encoded = JSON.stringify(source).replace(/</g, '\\u003c');
  const csp = `default-src 'none'; script-src ${MERMAID_CDN} 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;`;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<style>html,body{margin:0;padding:12px;background:${PREVIEW_SURFACE};}#c{display:flex;justify-content:center;}</style>`,
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

export function buildSandboxedArtifactHtml(content: string, kind: PreviewableKind): string {
  const body = kind === 'svg' ? `<div>${content}</div>` : content;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
    '<style>',
    `html,body{margin:0;padding:12px;background:${PREVIEW_SURFACE};color:${PREVIEW_TEXT};`,
    'font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;line-height:1.5;}',
    'img,svg,video,table{max-width:100%;height:auto;}',
    'pre{white-space:pre-wrap;word-break:break-word;}',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('');
}
