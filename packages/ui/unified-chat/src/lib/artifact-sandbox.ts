import { ARTIFACT_CSP_CONTENT, stripTrailingSlashes } from '@agiworkforce/types';

export const ARTIFACT_SANDBOX_ATTR = 'allow-scripts allow-modals';

export { ARTIFACT_CSP_CONTENT };

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP_CONTENT}">`;

const BASE_STYLES =
  `<style>` +
  `* { box-sizing: border-box; } ` +
  `:root { color-scheme: light dark; } ` +
  `body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: CanvasText; background: Canvas; } ` +
  `</style>`;

export interface OpeningTag {
  start: number;
  end: number;
}

export function findOpeningTags(html: string, name: string, firstOnly = false): OpeningTag[] {
  const opening = new RegExp(`<${name}\\b`, 'gi');
  const tags: OpeningTag[] = [];
  let cursor = 0;
  for (let match = opening.exec(html); match; match = opening.exec(html)) {
    const close = html.indexOf('>', match.index + match[0].length);
    if (close === -1) break;
    tags.push({ start: match.index, end: close + 1 });
    if (firstOnly) break;
    cursor = close + 1;
    opening.lastIndex = cursor;
  }
  return tags;
}

function stripCspMetaTags(content: string): string {
  let out = '';
  let cursor = 0;
  for (const { start, end } of findOpeningTags(content, 'meta')) {
    const tag = content.slice(start, end);
    const lower = tag.toLowerCase();
    const isCsp = lower.includes('http-equiv') && lower.includes('content-security-policy');
    out += content.slice(cursor, isCsp ? start : end);
    cursor = end;
  }
  return out + content.slice(cursor);
}

export function insertAfterOpeningTag(
  html: string,
  name: string,
  insertion: string,
): string | null {
  const [tag] = findOpeningTags(html, name, true);
  return tag ? `${html.slice(0, tag.end)}${insertion}${html.slice(tag.end)}` : null;
}

function injectHeadContent(documentHtml: string, headContent: string): string {
  return (
    insertAfterOpeningTag(documentHtml, 'head', `\n${headContent}`) ??
    insertAfterOpeningTag(documentHtml, 'html', `<head>${headContent}</head>`) ??
    wrapBareDocument(documentHtml, headContent)
  );
}

function wrapBareDocument(documentHtml: string, headContent: string): string {
  const doctype = documentHtml.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '';
  const body = documentHtml.slice(doctype.length);
  return `${doctype}<html><head>${headContent}</head><body>${body}</body></html>`;
}

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

export const ARTIFACT_SANDBOX_SCHEME = 'artifact';

export type ArtifactSandboxKind =
  'html' | 'react' | 'svg' | 'mermaid' | 'markdown' | 'text' | 'code';

export interface ArtifactRenderPayload {
  type: 'render';
  kind: ArtifactSandboxKind;
  html?: string;
  code?: string;
  svg?: string;
  text?: string;
  runScripts?: boolean;
}

export interface SandboxIncomingMessage {
  type: 'sandbox-ready' | 'render-complete' | 'render-error';
  kind?: ArtifactSandboxKind;
  error?: string;
}

let configuredOrigin: string | null | undefined;

/**
 * Set (or clear, with `null`) the sandbox origin explicitly. `undefined` restores
 * automatic detection. Exported mainly as a test seam and as an escape hatch for
 * a host that knows better than the detection below.
 */
export function configureArtifactSandboxOrigin(origin: string | null | undefined): void {
  configuredOrigin = origin;
}

function normalizeSandboxOrigin(raw: string): string | null {
  const trimmed = stripTrailingSlashes(raw.trim());
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const isLoopbackHost =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.endsWith('.localhost');
  const acceptable =
    url.protocol === `${ARTIFACT_SANDBOX_SCHEME}:` ||
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && isLoopbackHost);
  if (!acceptable) return null;
  if (!url.host) return null;
  return `${url.protocol}//${url.host}`;
}

function tauriArtifactOrigin(): string | null {
  const internals = (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ as
    { convertFileSrc?: (path: string, protocol?: string) => string } | undefined;
  if (typeof internals?.convertFileSrc !== 'function') return null;
  try {
    return normalizeSandboxOrigin(internals.convertFileSrc('', ARTIFACT_SANDBOX_SCHEME));
  } catch {
    return null;
  }
}

function globalArtifactOrigin(): string | null {
  const injected = (globalThis as { __AGI_ARTIFACT_SANDBOX_ORIGIN__?: unknown })
    .__AGI_ARTIFACT_SANDBOX_ORIGIN__;
  return typeof injected === 'string' ? normalizeSandboxOrigin(injected) : null;
}

function envArtifactOrigin(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const raw = env?.['NEXT_PUBLIC_SANDBOX_ORIGIN'];
  return typeof raw === 'string' ? normalizeSandboxOrigin(raw) : null;
}

function isThisAppsOwnOrigin(origin: string): boolean {
  const here = (globalThis as { location?: { origin?: string } }).location?.origin;
  return typeof here === 'string' && here !== 'null' && here === origin;
}

/**
 * The origin an artifact preview should be framed from, or `null` when there is
 * none and callers must fall back to {@link buildSandboxedHtml} + `srcDoc`.
 *
 * Not cached: the result is a couple of string operations, and caching it would
 * make the value depend on which component happened to render first.
 */
export function getArtifactSandboxOrigin(): string | null {
  const resolved =
    configuredOrigin !== undefined
      ? configuredOrigin === null
        ? null
        : normalizeSandboxOrigin(configuredOrigin)
      : (globalArtifactOrigin() ?? tauriArtifactOrigin() ?? envArtifactOrigin());
  if (resolved === null) return null;
  return isThisAppsOwnOrigin(resolved) ? null : resolved;
}

export function buildArtifactSandboxUrl(): string | null {
  const origin = getArtifactSandboxOrigin();
  return origin ? `${origin}/` : null;
}

export function isArtifactSandboxMessage(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): boolean {
  if (!frame || !event.source || event.source !== frame.contentWindow) return false;
  const expected = getArtifactSandboxOrigin();
  if (!expected) return false;
  return event.origin === expected || event.origin === 'null';
}

export function postRenderToArtifactSandbox(
  frame: HTMLIFrameElement | null,
  payload: ArtifactRenderPayload,
  replyOrigin?: string,
): boolean {
  const target = frame?.contentWindow;
  if (!target) return false;
  const origin = getArtifactSandboxOrigin();
  if (!origin) return false;
  const targetOrigin = !replyOrigin || replyOrigin === 'null' ? '*' : replyOrigin;
  target.postMessage(payload, targetOrigin);
  return true;
}
