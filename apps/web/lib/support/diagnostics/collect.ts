import {
  MAX_DIAGNOSTIC_EVENTS,
  type DiagnosticEvent,
  type DiagnosticSurface,
  type SupportDiagnostics,
} from './types';

/**
 * Client-side collection. Every field is read from the runtime the caller is
 * already in, so this runs on any surface that has a DOM: the web app, the
 * desktop renderer, the Chrome extension and the VS Code webview. A surface
 * without one passes its own values in `overrides`.
 *
 * Nothing here reads storage, cookies or the document body. A bundle carries
 * what the runtime knows about itself, never what the user was working on.
 */

export interface DiagnosticsInput {
  surface: DiagnosticSurface;
  appVersion?: string | null;
  releaseSha?: string | null;
  deployEnv?: string | null;
  conversationId?: string | null;
  recentEvents?: readonly DiagnosticEvent[];
}

const recentEvents: DiagnosticEvent[] = [];

/**
 * A ring buffer the surfaces push into from their error boundaries and failed
 * requests. Bounded, so an error loop cannot grow it without limit, and oldest
 * first out, so a bundle carries what happened just before the user gave up.
 */
export function recordDiagnosticEvent(event: DiagnosticEvent): void {
  recentEvents.push(event);
  while (recentEvents.length > MAX_DIAGNOSTIC_EVENTS) recentEvents.shift();
}

export function clearDiagnosticEvents(): void {
  recentEvents.length = 0;
}

function readTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function collectDiagnostics(input: DiagnosticsInput): SupportDiagnostics {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  return {
    collectedAt: new Date().toISOString(),
    surface: input.surface,
    appVersion: input.appVersion ?? null,
    releaseSha: input.releaseSha ?? null,
    deployEnv: input.deployEnv ?? null,
    platform: hasNavigator ? (navigator.userAgent ?? null) : null,
    locale: hasNavigator ? (navigator.language ?? null) : null,
    timeZone: readTimeZone(),
    viewport: hasWindow ? { width: window.innerWidth, height: window.innerHeight } : null,
    online: hasNavigator && typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
    pagePath: hasWindow ? window.location.pathname : null,
    conversationId: input.conversationId ?? null,
    recentEvents: [...(input.recentEvents ?? recentEvents)].slice(-MAX_DIAGNOSTIC_EVENTS),
  };
}
