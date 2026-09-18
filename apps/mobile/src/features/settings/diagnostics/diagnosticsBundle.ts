import Constants from 'expo-constants';
import { Dimensions, Platform } from 'react-native';

import { apiFetch } from '../../../../services/api';

/**
 * Shape of apps/web/lib/support/diagnostics/types.ts. There is no DOM here, so
 * every field is read from the native runtime instead. The server validates
 * and redacts it, so nothing is exported that the server has not cleaned.
 */
export interface MobileDiagnosticsBundle {
  collectedAt: string;
  surface: 'mobile';
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
  diagnostics: MobileDiagnosticsBundle;
  summary: string;
  filename: string;
}

export const MAX_DIAGNOSTIC_EVENTS = 10;
const DIAGNOSTICS_PATH = '/api/support/diagnostics';

function readResolvedOptions(): { locale?: string; timeZone?: string } {
  try {
    return Intl.DateTimeFormat().resolvedOptions();
  } catch {
    return {};
  }
}

function readViewport(): { width: number; height: number } | null {
  try {
    const { width, height } = Dimensions.get('window');
    return Number.isFinite(width) && Number.isFinite(height)
      ? { width: Math.round(width), height: Math.round(height) }
      : null;
  } catch {
    return null;
  }
}

export function collectMobileDiagnostics(
  input: {
    recentEvents?: readonly DiagnosticEvent[];
    conversationId?: string | null;
    screen?: string | null;
  } = {},
): MobileDiagnosticsBundle {
  const resolved = readResolvedOptions();

  return {
    collectedAt: new Date().toISOString(),
    surface: 'mobile',
    appVersion: Constants.expoConfig?.version ?? null,
    releaseSha: null,
    deployEnv: null,
    platform: `${Platform.OS} ${String(Platform.Version)}`.trim(),
    locale: resolved.locale ?? null,
    timeZone: resolved.timeZone ?? null,
    viewport: readViewport(),
    online: null,
    pagePath: input.screen ?? null,
    conversationId: input.conversationId ?? null,
    recentEvents: [...(input.recentEvents ?? [])].slice(-MAX_DIAGNOSTIC_EVENTS),
  };
}

export async function exportMobileDiagnostics(
  input: {
    recentEvents?: readonly DiagnosticEvent[];
    conversationId?: string | null;
    screen?: string | null;
  } = {},
): Promise<DiagnosticsExportResult> {
  const response = await apiFetch(DIAGNOSTICS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ diagnostics: collectMobileDiagnostics(input) }),
  });

  if (!response.ok) {
    throw new Error(
      `Diagnostics are redacted on the server, so nothing was exported (${response.status}).`,
    );
  }

  return (await response.json()) as DiagnosticsExportResult;
}
