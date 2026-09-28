export type ArtifactKind = 'html' | 'react' | 'svg' | 'mermaid' | 'markdown' | 'text' | 'code';

export interface ArtifactRenderPayload {
  type: 'render';
  kind: ArtifactKind;
  html?: string;
  code?: string;
  svg?: string;
  text?: string;
  runScripts?: boolean;
  runtime?: boolean;
}

export interface SandboxIncomingMessage {
  type: 'sandbox-ready' | 'render-complete' | 'render-error' | 'runtime-request';
  kind?: ArtifactKind;
  error?: string;
  id?: unknown;
  request?: unknown;
}

export type ArtifactRuntimeRequest =
  | { op: 'complete'; prompt: string }
  | { op: 'storage.get'; key: string; shared: boolean }
  | { op: 'storage.set'; key: string; value: string; shared: boolean }
  | { op: 'storage.delete'; key: string; shared: boolean }
  | { op: 'storage.list'; prefix: string | null; shared: boolean };

export interface ArtifactRuntimeHost {
  handle(request: ArtifactRuntimeRequest): Promise<unknown>;
}

const RUNTIME_REQUEST_ID = /^runtime-\d{1,12}$/;
const MAX_RUNTIME_TEXT_CHARS = 5_000_000;

function runtimeText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_RUNTIME_TEXT_CHARS ? value : null;
}

export function parseRuntimeRequestId(value: unknown): string | null {
  return typeof value === 'string' && RUNTIME_REQUEST_ID.test(value) ? value : null;
}

export function parseArtifactRuntimeRequest(value: unknown): ArtifactRuntimeRequest | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const shared = source['shared'] === true;
  const key =
    typeof source['key'] === 'string' && source['key'].length <= 200 ? source['key'] : null;
  switch (source['op']) {
    case 'complete': {
      const prompt = runtimeText(source['prompt']);
      return prompt === null ? null : { op: 'complete', prompt };
    }
    case 'storage.get':
      return key === null ? null : { op: 'storage.get', key, shared };
    case 'storage.set': {
      const text = runtimeText(source['value']);
      return key === null || text === null ? null : { op: 'storage.set', key, value: text, shared };
    }
    case 'storage.delete':
      return key === null ? null : { op: 'storage.delete', key, shared };
    case 'storage.list': {
      const prefix = source['prefix'];
      if (prefix !== null && (typeof prefix !== 'string' || prefix.length > 200)) return null;
      return { op: 'storage.list', prefix, shared };
    }
    default:
      return null;
  }
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

export function postRuntimeResponseToSandbox(
  iframe: HTMLIFrameElement,
  response: { id: string; ok: true; value: unknown } | { id: string; ok: false; error: string },
): void {
  const origin = getSandboxOrigin();
  const target = iframe.contentWindow;
  if (!origin || !target) return;
  target.postMessage({ type: 'runtime-response', ...response }, origin);
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
