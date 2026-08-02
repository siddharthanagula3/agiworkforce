/**
 * artifact-sandbox — how an artifact preview gets a document to run in.
 *
 * Two paths live here, in preference order:
 *
 * 1. **A dedicated sandbox ORIGIN** (`getArtifactSandboxOrigin`). The preview is
 *    an `<iframe src="…">` pointed at `infrastructure/sandbox/index.html`, and
 *    the artifact is shipped over `postMessage`. Because that document is
 *    cross-origin it carries its OWN Content-Security-Policy, so interactive
 *    HTML and React artifacts actually run.
 *
 * 2. **A same-document `srcDoc` fallback** (`buildSandboxedHtml`). Used when no
 *    sandbox origin exists. It is safe but LIMITED: an `about:srcdoc` document
 *    inherits the embedder's CSP, and the permissive `<meta>` policy below can
 *    only intersect with the inherited policy, never widen it. Inside the
 *    packaged desktop app the embedder policy is `script-src 'self'
 *    'wasm-unsafe-eval'`, so on that surface this path renders markup and
 *    nothing else. That is DES-C15, and path (1) is its fix — see
 *    `lib/artifact-preview-capability.ts` for the runtime measurement that keeps
 *    the fallback honest about it.
 *
 * Both `ArtifactPanel` and `ArtifactRenderer.HtmlArtifact` consume the fallback
 * builder so the sandbox attribute, CSP meta, and base styles cannot drift
 * between the two surfaces. Round-2 audit P0 #9 (Artifacts live preview,
 * 2026-05-21); origin path added 2026-08-01.
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

// ---------------------------------------------------------------------------
// Cross-origin sandbox contract
// ---------------------------------------------------------------------------
//
// This is the SAME wire contract `apps/web/lib/artifact-sandbox.ts` implements
// and `infrastructure/sandbox/index.html` answers. It is restated here (rather
// than imported) only because this package cannot depend on `apps/web`; the
// renderer is one file and the message shapes below must match it exactly:
//
//   sandbox → parent : { type: 'sandbox-ready' }                (targetOrigin '*')
//   parent  → sandbox: { type: 'render', kind, … }              (targetOrigin = sandbox origin)
//   sandbox → parent : { type: 'render-complete', kind }
//   sandbox → parent : { type: 'render-error', error }
//
// The renderer drops any message whose `event.origin` is not on its own
// ALLOWED_PARENT_ORIGINS list, and this side drops any message that did not come
// from the frame we mounted.

/**
 * URI scheme the desktop binary serves the renderer from.
 *
 * Must stay in sync with `ARTIFACT_SANDBOX_SCHEME` in
 * `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs` and with `frame-src` in
 * `apps/desktop/src-tauri/tauri.conf.json`.
 */
export const ARTIFACT_SANDBOX_SCHEME = 'artifact';

/** Artifact shapes the shared renderer knows how to draw. */
export type ArtifactSandboxKind =
  | 'html'
  | 'react'
  | 'svg'
  | 'mermaid'
  | 'markdown'
  | 'text'
  | 'code';

/** Parent → sandbox. Mirrors `dispatchRender` in the renderer. */
export interface ArtifactRenderPayload {
  type: 'render';
  kind: ArtifactSandboxKind;
  /** Full HTML document for `kind: 'html'`. */
  html?: string;
  /** Source for `kind: 'react' | 'mermaid' | 'code'`. */
  code?: string;
  /** Pre-sanitized markup for `kind: 'svg'`. */
  svg?: string;
  /** Plain text for `kind: 'text' | 'markdown' | 'code'`. */
  text?: string;
  /**
   * Opt-in script execution for `kind: 'html'`. The renderer assigns `html` via
   * `innerHTML`, which never executes `<script>`; this flag makes it re-create
   * the script elements so an interactive artifact behaves like a page.
   */
  runScripts?: boolean;
}

/** Sandbox → parent. */
export interface SandboxIncomingMessage {
  type: 'sandbox-ready' | 'render-complete' | 'render-error';
  kind?: ArtifactSandboxKind;
  error?: string;
}

/** Explicit override, for hosts that resolve the origin themselves and tests. */
let configuredOrigin: string | null | undefined;

/**
 * Set (or clear, with `null`) the sandbox origin explicitly. `undefined` restores
 * automatic detection. Exported mainly as a test seam and as an escape hatch for
 * a host that knows better than the detection below.
 */
export function configureArtifactSandboxOrigin(origin: string | null | undefined): void {
  configuredOrigin = origin;
}

/**
 * Accept only origins that can actually be an isolated renderer:
 * the `artifact:` scheme, `https:`, or loopback `http:` (which covers both the
 * Vite dev server and Windows' `http://artifact.localhost` mapping).
 *
 * Returns a bare `scheme://host[:port]` with no trailing slash, which is the
 * exact string `postMessage` targetOrigin and `event.origin` use.
 */
function normalizeSandboxOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
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

/**
 * Ask the Tauri runtime where our custom scheme lives.
 *
 * `__TAURI_INTERNALS__.convertFileSrc(path, scheme)` is Tauri's own mapping and
 * is platform-correct by construction — `artifact://localhost/…` on
 * macOS/Linux/iOS, `http://artifact.localhost/…` on Windows/Android. Deriving
 * the origin from it means this package never has to sniff the user agent or be
 * told the platform, and it stays right if Tauri changes the mapping.
 */
function tauriArtifactOrigin(): string | null {
  const internals = (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ as
    | { convertFileSrc?: (path: string, protocol?: string) => string }
    | undefined;
  if (typeof internals?.convertFileSrc !== 'function') return null;
  try {
    return normalizeSandboxOrigin(internals.convertFileSrc('', ARTIFACT_SANDBOX_SCHEME));
  } catch {
    return null;
  }
}

/** Host-injected override, e.g. a web shell that renders outside Next.js. */
function globalArtifactOrigin(): string | null {
  const injected = (globalThis as { __AGI_ARTIFACT_SANDBOX_ORIGIN__?: unknown })
    .__AGI_ARTIFACT_SANDBOX_ORIGIN__;
  return typeof injected === 'string' ? normalizeSandboxOrigin(injected) : null;
}

/** Web's build-time origin, kept for parity with `apps/web/lib/artifact-sandbox.ts`. */
function envArtifactOrigin(): string | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const raw = env?.['NEXT_PUBLIC_SANDBOX_ORIGIN'];
  return typeof raw === 'string' ? normalizeSandboxOrigin(raw) : null;
}

/**
 * Reject a "sandbox" origin that is actually this app's own origin.
 *
 * The preview frame is mounted with `allow-scripts allow-same-origin`, which is
 * only safe because the framed document is cross-origin. Point the same flags at
 * a same-origin document and the sandbox is defeated by spec — the artifact
 * would reach this app's DOM, storage and IPC bridge. A misconfigured
 * `NEXT_PUBLIC_SANDBOX_ORIGIN` (or an injected global) is exactly how that would
 * happen by accident, so it is refused here rather than trusted.
 */
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

/** URL to point the preview iframe at, or `null` when no sandbox origin exists. */
export function buildArtifactSandboxUrl(): string | null {
  const origin = getArtifactSandboxOrigin();
  return origin ? `${origin}/` : null;
}

/**
 * Authenticate a message as coming from the sandbox frame we mounted.
 *
 * Window identity is the primary check — only the frame we created can be
 * `frame.contentWindow`, and it holds even if an engine reports an opaque origin
 * for a custom scheme. The origin check then rejects anything that navigated
 * away from the sandbox origin; `'null'` is accepted only alongside the window
 * match, for engines that treat a custom scheme as an opaque origin.
 */
export function isArtifactSandboxMessage(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): boolean {
  if (!frame || !event.source || event.source !== frame.contentWindow) return false;
  const expected = getArtifactSandboxOrigin();
  if (!expected) return false;
  return event.origin === expected || event.origin === 'null';
}

/**
 * Post an artifact to the sandbox frame.
 *
 * `replyOrigin` is the origin the sandbox announced itself from. It is used
 * verbatim as `targetOrigin` so the payload is delivered to that document and no
 * other. When the engine reported an opaque origin (`'null'`) there is no origin
 * string to target and `'*'` is the only option — safe here because the message
 * is addressed to one specific window we own, and because the app's `frame-src`
 * prevents that frame from navigating anywhere else.
 *
 * Returns `false` when there is nothing to post to.
 */
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
