/**
 * Shape of apps/web/lib/support/diagnostics/types.ts. The server validates and
 * redacts it, so the command never writes a file the server has not cleaned.
 */
export interface VsCodeDiagnosticsBundle {
  collectedAt: string;
  surface: 'extension-vscode';
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

export interface VsCodeDiagnosticsEnvironment {
  extensionVersion: string | null;
  hostName: string | null;
  hostVersion: string | null;
  language: string | null;
  osPlatform: string | null;
}

export interface DiagnosticsExportResult {
  diagnostics: VsCodeDiagnosticsBundle;
  summary: string;
  filename: string;
}

export const MAX_DIAGNOSTIC_EVENTS = 10;
const DIAGNOSTICS_PATH = '/api/support/diagnostics';

function readTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function describeHost(environment: VsCodeDiagnosticsEnvironment): string | null {
  const parts = [environment.hostName, environment.hostVersion, environment.osPlatform].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

export function collectVsCodeDiagnostics(
  environment: VsCodeDiagnosticsEnvironment,
  input: { recentEvents?: readonly DiagnosticEvent[]; conversationId?: string | null } = {},
): VsCodeDiagnosticsBundle {
  return {
    collectedAt: new Date().toISOString(),
    surface: 'extension-vscode',
    appVersion: environment.extensionVersion,
    releaseSha: null,
    deployEnv: null,
    platform: describeHost(environment),
    locale: environment.language,
    timeZone: readTimeZone(),
    // An editor window has no viewport the support contract can compare, and
    // the open file is not the extension's to report.
    viewport: null,
    online: null,
    pagePath: null,
    conversationId: input.conversationId ?? null,
    recentEvents: [...(input.recentEvents ?? [])].slice(-MAX_DIAGNOSTIC_EVENTS),
  };
}

export async function exportVsCodeDiagnostics(request: {
  token: string;
  baseUrl: string;
  environment: VsCodeDiagnosticsEnvironment;
  recentEvents?: readonly DiagnosticEvent[];
  conversationId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DiagnosticsExportResult> {
  const send = request.fetchImpl ?? fetch;
  const diagnostics = collectVsCodeDiagnostics(request.environment, {
    ...(request.recentEvents ? { recentEvents: request.recentEvents } : {}),
    conversationId: request.conversationId ?? null,
  });

  const response = await send(`${request.baseUrl}${DIAGNOSTICS_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.token}`,
      'X-Requested-With': 'XMLHttpRequest',
      'X-AGI-Surface': 'vscode',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ diagnostics }),
  });

  if (!response.ok) {
    throw new Error(
      `Diagnostics are redacted on the server, so nothing was exported (${response.status}).`,
    );
  }

  return (await response.json()) as DiagnosticsExportResult;
}
