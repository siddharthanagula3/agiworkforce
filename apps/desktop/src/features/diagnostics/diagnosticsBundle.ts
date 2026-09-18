import { CLOUD_API_BASE_URL, cloudFetch, getAuthHeaders } from '../../api/cloudApi';
import { invoke } from '../../utils/ipc';

/**
 * Shape of apps/web/lib/support/diagnostics/types.ts. The server validates and
 * redacts it, so this build never writes a file the server has not cleaned.
 */
export interface DesktopDiagnosticsBundle {
  collectedAt: string;
  surface: 'desktop';
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
  recentEvents: { at: string; kind: 'error' | 'warning' | 'request_failed'; message: string }[];
}

export interface DiagnosticsExportResult {
  diagnostics: DesktopDiagnosticsBundle;
  summary: string;
  filename: string;
}

const MAX_RECENT_EVENTS = 10;
const DIAGNOSTICS_PATH = '/api/support/diagnostics';

function readTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Log lines come back already redacted by `sys::support_bundle` on the Rust
 * side; the server redacts them again before anything is exported.
 */
async function readRecentLogLines(): Promise<string[]> {
  try {
    const lines = await invoke<string[]>('error_get_logs', { lines: MAX_RECENT_EVENTS });
    return Array.isArray(lines) ? lines.slice(-MAX_RECENT_EVENTS) : [];
  } catch {
    return [];
  }
}

export async function collectDesktopDiagnostics(
  input: { appVersion?: string | null; conversationId?: string | null } = {},
): Promise<DesktopDiagnosticsBundle> {
  const at = new Date().toISOString();
  const lines = await readRecentLogLines();

  return {
    collectedAt: at,
    surface: 'desktop',
    appVersion: input.appVersion ?? null,
    releaseSha: null,
    deployEnv: null,
    platform: typeof navigator === 'undefined' ? null : (navigator.userAgent ?? null),
    locale: typeof navigator === 'undefined' ? null : (navigator.language ?? null),
    timeZone: readTimeZone(),
    viewport:
      typeof window === 'undefined'
        ? null
        : { width: window.innerWidth, height: window.innerHeight },
    online:
      typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : null,
    pagePath: typeof window === 'undefined' ? null : window.location.pathname,
    conversationId: input.conversationId ?? null,
    recentEvents: lines
      .filter((line) => typeof line === 'string' && line.trim().length > 0)
      .map((line) => ({ at, kind: 'error' as const, message: line.trim() })),
  };
}

export async function exportDesktopDiagnostics(
  input: { appVersion?: string | null; conversationId?: string | null } = {},
): Promise<DiagnosticsExportResult> {
  const diagnostics = await collectDesktopDiagnostics(input);
  const headers = await getAuthHeaders();
  const response = await cloudFetch(`${CLOUD_API_BASE_URL}${DIAGNOSTICS_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ diagnostics }),
  });

  if (!response.ok) {
    throw new Error(
      'Diagnostics could not be prepared. The bundle is redacted on the server, so nothing is exported while it is unreachable.',
    );
  }

  return (await response.json()) as DiagnosticsExportResult;
}
