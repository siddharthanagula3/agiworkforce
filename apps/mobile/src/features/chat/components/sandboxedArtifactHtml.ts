/**
 * Pure builder for the hardened artifact-preview document. Kept free of any
 * native (WebView) import so it is unit-testable in isolation. Rendered by
 * {@link SafeArtifactPreview}; HTML runs its scripts under the canonical
 * artifact policy, SVG and the fallback stay script-free.
 */
import { ARTIFACT_CSP_CONTENT } from '@agiworkforce/types';
import { lightColors } from '@/src/ui/theme/tokens';

export type PreviewableKind = 'html' | 'svg' | 'mermaid';

export interface MermaidAppearance {
  background: string;
  dark: boolean;
}

export type MermaidPreviewMessage =
  { type: 'rendered'; height: number } | { type: 'failed'; reason: string };

export interface ArtifactPreviewError {
  type: 'error';
  message: string;
}

const MAX_FAILURE_REASON_LENGTH = 200;

const PREVIEW_SURFACE = lightColors.background;
const PREVIEW_TEXT = lightColors.textPrimary;

const MERMAID_CDN = 'https://cdn.jsdelivr.net';
const MERMAID_SRC_URL = `${MERMAID_CDN}/npm/mermaid@11/dist/mermaid.min.js`;

export function buildMermaidPreviewHtml(source: string, appearance?: MermaidAppearance): string {
  const encoded = JSON.stringify(source).replace(/</g, '\\u003c');
  const background = appearance?.background ?? PREVIEW_SURFACE;
  const theme = appearance?.dark ? 'dark' : 'default';
  const csp = `default-src 'none'; script-src ${MERMAID_CDN} 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;`;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<style>html,body{margin:0;padding:12px;background:${background};}#c{display:flex;justify-content:center;}</style>`,
    '</head><body>',
    '<div id="c"></div>',
    `<script src="${MERMAID_SRC_URL}"></script>`,
    '<script>',
    `var src = ${encoded};`,
    'function post(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }',
    "function fail(e){ document.getElementById('c').textContent = 'Could not render this diagram.'; post({ type: 'failed', reason: String((e && e.message) || e || '') }); }",
    'try {',
    `  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: '${theme}' });`,
    "  mermaid.render('d', src).then(function(r){ document.getElementById('c').innerHTML = r.svg; post({ type: 'rendered', height: Math.ceil(document.documentElement.scrollHeight) }); })",
    '    .catch(fail);',
    '} catch (e) { fail(e); }',
    '</script>',
    '</body></html>',
  ].join('');
}

export function parseMermaidPreviewMessage(data: string): MermaidPreviewMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  const { type, height, reason } = message as Record<string, unknown>;
  if (type === 'rendered' && typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return { type, height };
  }
  if (type === 'failed') {
    const firstLine = typeof reason === 'string' ? (reason.split('\n')[0] ?? '').trim() : '';
    return { type, reason: firstLine.slice(0, MAX_FAILURE_REASON_LENGTH) };
  }
  return null;
}

const STATIC_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:;";

const ERROR_REPORTER = [
  '<script>',
  '(function(){',
  'var sent=false;',
  'function report(m){ if (sent || !window.ReactNativeWebView) return; sent=true;',
  "window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(m || 'Script error') })); }",
  "window.addEventListener('error', function(e){ report(e && (e.message || (e.error && e.error.message))); });",
  "window.addEventListener('unhandledrejection', function(e){ var r = e && e.reason; report((r && r.message) || r); });",
  '})();',
  '</script>',
].join('');

export function parseArtifactPreviewError(data: string): ArtifactPreviewError | null {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  const record = message as Record<string, unknown>;
  const text = record['message'];
  if (record['type'] !== 'error' || typeof text !== 'string') return null;
  const firstLine = (text.split('\n')[0] ?? '').trim();
  return { type: 'error', message: firstLine.slice(0, MAX_FAILURE_REASON_LENGTH) };
}

export function buildSandboxedArtifactHtml(content: string, kind: PreviewableKind): string {
  const runsScripts = kind === 'html';
  const body = kind === 'svg' ? `<div>${content}</div>` : content;
  const csp = runsScripts ? ARTIFACT_CSP_CONTENT : STATIC_CONTENT_SECURITY_POLICY;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    runsScripts ? ERROR_REPORTER : '',
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
