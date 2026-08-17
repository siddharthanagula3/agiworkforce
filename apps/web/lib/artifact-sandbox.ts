export type ArtifactKind = 'html' | 'react' | 'svg' | 'mermaid' | 'markdown' | 'text' | 'code';

export interface ArtifactRenderPayload {
  type: 'render';
  kind: ArtifactKind;
  html?: string;
  code?: string;
  svg?: string;
  text?: string;
  runScripts?: boolean;
}

export interface SandboxIncomingMessage {
  type: 'sandbox-ready' | 'render-complete' | 'render-error';
  kind?: ArtifactKind;
  error?: string;
}

function isThisAppsOwnOrigin(origin: string): boolean {
  const here = (globalThis as { location?: { origin?: string } }).location?.origin;
  return typeof here === 'string' && here !== 'null' && here === origin;
}

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
    const origin = `${url.protocol}//${url.host}`;
    // SandboxedIframe frames this origin with `allow-same-origin`; pointed at the
    // app's own origin that hands artifact scripts the user's session, so a
    // misprovisioned value must degrade to the opaque srcDoc fallback instead.
    return isThisAppsOwnOrigin(origin) ? null : origin;
  } catch {
    return null;
  }
}

export function isSandboxConfigured(): boolean {
  return getSandboxOrigin() !== null;
}

export function isFromSandbox(event: MessageEvent): boolean {
  const expected = getSandboxOrigin();
  if (!expected) return false;
  return event.origin === expected;
}

export function buildSandboxIframeUrl(): string | null {
  const origin = getSandboxOrigin();
  return origin ? `${origin}/` : null;
}

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
