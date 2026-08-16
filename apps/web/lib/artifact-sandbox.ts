
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
