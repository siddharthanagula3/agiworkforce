/**
 * Helpers for rendering LLM artifacts inside the cross-origin sandbox
 * (`sandbox.agiworkforce.com`) via postMessage.
 *
 * Why: WEB-13 (audit 2026-05-19) closed the iframe-sandbox-escape finding
 * (`<iframe sandbox="allow-scripts allow-same-origin">` on the parent origin
 * defeats the sandbox by spec). The fix is to render artifacts from a
 * separate origin so the iframe is cross-origin by construction.
 *
 * Behavior:
 * - If `NEXT_PUBLIC_SANDBOX_ORIGIN` is set, this module's helpers point at
 *   that origin. Components load
 *   `<iframe src="${sandbox}/" sandbox="allow-scripts allow-same-origin">`
 *   and ship the artifact via `postMessage`. Preserving the dedicated
 *   renderer's origin lets the parent authenticate its messages. It does not
 *   restore access to the parent because the two documents remain
 *   cross-origin.
 * - If unset, `getSandboxOrigin()` returns `null`. Components fall back to
 *   `<iframe sandbox="allow-scripts" srcDoc=...>` · same-origin but without
 *   `allow-same-origin`, which still closes the dual-flag bypass.
 *
 * See `infrastructure/sandbox/` for the renderer and its CSP envelope.
 */

export type ArtifactKind = 'html' | 'react' | 'svg' | 'mermaid' | 'markdown' | 'text' | 'code';

export interface ArtifactRenderPayload {
  type: 'render';
  kind: ArtifactKind;
  /** Raw HTML body for kind=html / svg / mermaid mirrors. */
  html?: string;
  /** Source code for kind=react / mermaid / code. */
  code?: string;
  /** Pre-validated SVG markup for kind=svg. */
  svg?: string;
  /** Plain text for kind=text / markdown / code rendering. */
  text?: string;
  /**
   * Opt-in script-execution flag for kind=html. Default false · inline
   * `<script>` tags in `html` do NOT execute unless the caller explicitly
   * marks the artifact as needing them.
   */
  runScripts?: boolean;
}

export interface SandboxIncomingMessage {
  type: 'sandbox-ready' | 'render-complete' | 'render-error';
  kind?: ArtifactKind;
  error?: string;
}

/**
 * Return the configured sandbox origin, or `null` if the env var is unset.
 * Browser-side reads `process.env.NEXT_PUBLIC_SANDBOX_ORIGIN`. Returns a
 * trimmed, trailing-slash-stripped origin so consumers can build URLs
 * predictably.
 */
export function getSandboxOrigin(): string | null {
  const raw = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** True iff the cross-origin sandbox path is active. */
export function isSandboxConfigured(): boolean {
  return getSandboxOrigin() !== null;
}

/**
 * Validate that an incoming postMessage event is from the configured
 * sandbox origin. Use inside parent-side `message` event handlers before
 * trusting any data.
 */
export function isFromSandbox(event: MessageEvent): boolean {
  const expected = getSandboxOrigin();
  if (!expected) return false;
  return event.origin === expected;
}

/**
 * Build the iframe URL for the sandbox. Returns `null` if the sandbox
 * isn't configured · callers should then fall back to `srcDoc`.
 */
export function buildSandboxIframeUrl(): string | null {
  const origin = getSandboxOrigin();
  return origin ? `${origin}/` : null;
}

/**
 * Post a render payload to an embedded sandbox iframe. The caller is
 * responsible for waiting for the `sandbox-ready` message before
 * dispatching to avoid races.
 */
export function postRenderToSandbox(
  iframe: HTMLIFrameElement,
  payload: ArtifactRenderPayload,
): void {
  const origin = getSandboxOrigin();
  if (!origin) {
    throw new Error('Sandbox origin not configured · cannot postMessage');
  }
  const target = iframe.contentWindow;
  if (!target) return;
  target.postMessage(payload, origin);
}
