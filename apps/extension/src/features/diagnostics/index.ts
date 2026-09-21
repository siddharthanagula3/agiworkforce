import { configuredAgiWebOrigin, DEFAULT_AGI_WEB_ORIGIN } from '../../lib/webOrigin';
import { platformRequestHeaders } from '../../platformHeaders';

/**
 * Shape of apps/web/lib/support/diagnostics/types.ts. The server validates and
 * redacts it, so the popup never hands the user a file the server has not
 * cleaned.
 */
export interface ExtensionDiagnosticsBundle {
  collectedAt: string;
  surface: 'extension-chrome';
  appVersion: string | null;
  releaseSha: string | null;
  deployEnv: string | null;
  platform: string | null;
  locale: string | null;
  timeZone: string | null;
  viewport: { width: number; height: number } | null;
  online: boolean | null;
  pagePath: string | null;
  conversationId: string | null;
  recentEvents: DiagnosticEvent[];
}

export interface DiagnosticEvent {
  at: string;
  kind: 'error' | 'warning' | 'request_failed';
  message: string;
}

export interface DiagnosticsExportResult {
  diagnostics: ExtensionDiagnosticsBundle;
  summary: string;
  filename: string;
}

export const MAX_DIAGNOSTIC_EVENTS = 10;
const DIAGNOSTICS_PATH = '/api/support/diagnostics';

function manifestVersion(): string | null {
  try {
    return chrome.runtime.getManifest().version ?? null;
  } catch {
    return null;
  }
}

function readTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function collectExtensionDiagnostics(
  input: { recentEvents?: readonly DiagnosticEvent[]; conversationId?: string | null } = {},
): ExtensionDiagnosticsBundle {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  return {
    collectedAt: new Date().toISOString(),
    surface: 'extension-chrome',
    appVersion: manifestVersion(),
    releaseSha: null,
    deployEnv: null,
    platform: hasNavigator ? (navigator.userAgent ?? null) : null,
    locale: hasNavigator ? (navigator.language ?? null) : null,
    timeZone: readTimeZone(),
    viewport: hasWindow ? { width: window.innerWidth, height: window.innerHeight } : null,
    online: hasNavigator && typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
    // A popup's own path says nothing about the page the user was on, and the
    // page URL is not the extension's to report.
    pagePath: null,
    conversationId: input.conversationId ?? null,
    recentEvents: [...(input.recentEvents ?? [])].slice(-MAX_DIAGNOSTIC_EVENTS),
  };
}

export async function exportExtensionDiagnostics(
  token: string,
  input: { recentEvents?: readonly DiagnosticEvent[]; conversationId?: string | null } = {},
): Promise<DiagnosticsExportResult> {
  const origin = configuredAgiWebOrigin() ?? DEFAULT_AGI_WEB_ORIGIN;
  const response = await fetch(`${origin}${DIAGNOSTICS_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ diagnostics: collectExtensionDiagnostics(input) }),
  });

  if (!response.ok) {
    throw new Error(
      `Diagnostics are redacted on the server, so nothing was exported (${response.status}).`,
    );
  }

  return (await response.json()) as DiagnosticsExportResult;
}
