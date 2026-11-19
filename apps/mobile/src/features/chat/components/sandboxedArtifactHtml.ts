/**
 * Pure builder for the hardened artifact-preview document. Kept free of any
 * native (WebView) import so it is unit-testable in isolation. Rendered by
 * {@link SafeArtifactPreview}; HTML runs its scripts under the canonical
 * artifact policy and React runs the pinned shared document under it, SVG and
 * the fallback stay script-free.
 */
import { ARTIFACT_CSP_CONTENT } from '@agiworkforce/types';
import { buildReactPreviewDocument } from '@agiworkforce/unified-chat/react-preview-document';
import { lightColors } from '@/src/ui/theme/tokens';

export type PreviewableKind = 'html' | 'svg' | 'mermaid' | 'react';

export interface MermaidAppearance {
  background: string;
  dark: boolean;
  fontScale?: number;
  fitToWidth?: boolean;
}

export interface MermaidDrawing {
  width: number | null;
  svg: string | null;
}

export type MermaidPreviewMessage =
  ({ type: 'rendered'; height: number } & MermaidDrawing) | { type: 'failed'; reason: string };

export interface ArtifactPreviewError {
  type: 'error';
  message: string;
}

const MAX_FAILURE_REASON_LENGTH = 200;
const MERMAID_BASE_FONT_SIZE = 16;
const MERMAID_PAGE_PADDING = 12;
const MAX_DRAWN_SVG_LENGTH = 2_000_000;
const EXTERNAL_CONTENT_REASON = 'it loads content from another site';

const PREVIEW_SURFACE = lightColors.background;
const PREVIEW_TEXT = lightColors.textPrimary;

const MERMAID_CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;";

const MERMAID_VIEWPORT = 'width=device-width, initial-scale=1, minimum-scale=1, shrink-to-fit=no';

const MERMAID_PAGE_SCRIPT = [
  'var refused = false;',
  'function post(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }',
  "document.addEventListener('securitypolicyviolation', function(e){",
  "  if (!/^(https?:)?\\/\\//i.test(String((e && e.blockedURI) || ''))) return;",
  '  refused = true;',
  `  post({ type: 'failed', reason: '${EXTERNAL_CONTENT_REASON}' });`,
  '});',
  "function fail(e){ document.getElementById('c').textContent = 'Could not render this diagram.'; post({ type: 'failed', reason: String((e && e.message) || e || '') }); }",
  'function natural(svg){',
  "  svg.style.maxWidth = '';",
  "  var box = (svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);",
  '  if (box.length !== 4 || !(box[2] > 0) || !(box[3] > 0)) return;',
  "  if (!/%$/.test(svg.getAttribute('width') || '%')) return;",
  "  svg.setAttribute('width', String(Math.ceil(box[2])));",
  "  svg.setAttribute('height', String(Math.ceil(box[3])));",
  '}',
  'function fit(svg){',
  "  var width = parseFloat(svg.getAttribute('width') || '');",
  "  var height = parseFloat(svg.getAttribute('height') || '');",
  `  var room = document.documentElement.clientWidth - ${MERMAID_PAGE_PADDING * 2};`,
  "  if (!svg.getAttribute('viewBox') || !(room > 0) || !(height > 0) || !(width > room)) return;",
  "  svg.setAttribute('width', String(Math.floor(room)));",
  "  svg.setAttribute('height', String(Math.floor((height * room) / width)));",
  '}',
  'function drawn(r){',
  "  var host = document.getElementById('c');",
  '  host.innerHTML = r.svg;',
  "  var svg = host.querySelector('svg');",
  "  var markup = '';",
  '  if (svg) { natural(svg); markup = new XMLSerializer().serializeToString(svg); if (fitWidth) fit(svg); }',
  '  if (refused) return;',
  `  var width = Math.max(document.documentElement.scrollWidth, host.getBoundingClientRect().right + ${MERMAID_PAGE_PADDING});`,
  `  post({ type: 'rendered', height: Math.ceil(document.body.getBoundingClientRect().height), width: Math.ceil(width), svg: markup.length <= ${MAX_DRAWN_SVG_LENGTH} ? markup : '' });`,
  '}',
].join('\n');

export function buildMermaidPreviewHtml(
  source: string,
  runtime: string,
  appearance?: MermaidAppearance,
): string {
  const encoded = JSON.stringify(source).replace(/</g, '\\u003c');
  const background = appearance?.background ?? PREVIEW_SURFACE;
  const theme = appearance?.dark ? 'dark' : 'default';
  const csp = MERMAID_CONTENT_SECURITY_POLICY;
  const fontScale = appearance?.fontScale;
  const themeVariables =
    fontScale !== undefined && Number.isFinite(fontScale) && fontScale > 0 && fontScale !== 1
      ? `, themeVariables: { fontSize: '${Math.round(MERMAID_BASE_FONT_SIZE * fontScale)}px' }`
      : '';
  const config = `{ startOnLoad: false, securityLevel: 'strict', theme: '${theme}'${themeVariables}, htmlLabels: false, flowchart: { htmlLabels: false, useMaxWidth: true }, class: { htmlLabels: false }, suppressErrorRendering: true }`;
  return [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    `<meta name="viewport" content="${MERMAID_VIEWPORT}">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<style>html{margin:0;padding:0;background:${background};overflow:auto;}body{margin:0;padding:${MERMAID_PAGE_PADDING}px;background:${background};}#c{display:block;width:max-content;min-width:100%;}#c svg{display:block;margin:0 auto;max-width:none !important;}</style>`,
    '</head><body>',
    '<div id="c"></div>',
    `<script>${runtime}</script>`,
    '<script>',
    `var src = ${encoded};`,
    `var fitWidth = ${appearance?.fitToWidth === true};`,
    MERMAID_PAGE_SCRIPT,
    'try {',
    `  mermaid.initialize(${config});`,
    "  mermaid.render('d', src).then(drawn).catch(fail);",
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
  const { type, height, width, svg, reason } = message as Record<string, unknown>;
  if (type === 'rendered' && typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return {
      type,
      height,
      width: typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : null,
      svg:
        typeof svg === 'string' && svg.length > 0 && svg.length <= MAX_DRAWN_SVG_LENGTH
          ? svg
          : null,
    };
  }
  if (type === 'failed') {
    const firstLine = typeof reason === 'string' ? (reason.split('\n')[0] ?? '').trim() : '';
    return { type, reason: firstLine.slice(0, MAX_FAILURE_REASON_LENGTH) };
  }
  return null;
}

const SVG_OPENING_TAG = /<svg(?=[\s/>])/i;
const SVG_CLOSING_TAG = /<\/svg\s*>$/i;

export function isRenderableSvg(content: string): boolean {
  const start = content.search(SVG_OPENING_TAG);
  if (start < 0) return false;
  const markup = content.slice(start).trimEnd();
  const openingEnd = markup.indexOf('>');
  if (openingEnd < 0) return false;
  if (markup[openingEnd - 1] === '/') return openingEnd === markup.length - 1;
  return SVG_CLOSING_TAG.test(markup);
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
  if (kind === 'react') {
    return buildReactPreviewDocument(
      content,
      `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP_CONTENT}">${ERROR_REPORTER}`,
    );
  }
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
