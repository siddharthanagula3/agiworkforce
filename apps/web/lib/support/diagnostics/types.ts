/**
 * What a support contact carries about the machine it came from.
 *
 * One shape for every surface. A diagnostics bundle answers the four questions
 * a support reply otherwise starts by asking: which build, which environment,
 * which platform, and what went wrong just before. It is collected on the
 * client, redacted before it leaves, and never contains anything the user did
 * not already see on their own screen.
 *
 * Nothing here is a free-text field the user fills in. Everything is read from
 * the runtime, so a bundle cannot become a second place to type a password.
 */

export const DIAGNOSTIC_SURFACES = [
  'web',
  'desktop',
  'mobile',
  'cli',
  'extension-chrome',
  'extension-vscode',
] as const;

export type DiagnosticSurface = (typeof DIAGNOSTIC_SURFACES)[number];

export interface DiagnosticEvent {
  at: string;
  kind: 'error' | 'warning' | 'request_failed';
  message: string;
}

export interface SupportDiagnostics {
  collectedAt: string;
  surface: DiagnosticSurface;
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

export const MAX_DIAGNOSTIC_EVENTS = 10;
export const MAX_DIAGNOSTIC_MESSAGE_CHARS = 500;

/**
 * Rendered for a human reading a ticket. Kept beside the type so a new field
 * shows up in the summary instead of being silently dropped from every reply.
 */
export function describeDiagnostics(diagnostics: SupportDiagnostics): string {
  const lines = [
    `surface: ${diagnostics.surface}`,
    `app version: ${diagnostics.appVersion ?? 'unknown'}`,
    `release: ${diagnostics.releaseSha ?? 'unknown'}`,
    `environment: ${diagnostics.deployEnv ?? 'unknown'}`,
    `platform: ${diagnostics.platform ?? 'unknown'}`,
    `locale: ${diagnostics.locale ?? 'unknown'}`,
    `time zone: ${diagnostics.timeZone ?? 'unknown'}`,
    `viewport: ${
      diagnostics.viewport
        ? `${diagnostics.viewport.width}x${diagnostics.viewport.height}`
        : 'unknown'
    }`,
    `online: ${diagnostics.online === null ? 'unknown' : String(diagnostics.online)}`,
    `page: ${diagnostics.pagePath ?? 'unknown'}`,
  ];
  if (diagnostics.recentEvents.length > 0) {
    lines.push('recent events:');
    for (const event of diagnostics.recentEvents) {
      lines.push(`  ${event.at} [${event.kind}] ${event.message}`);
    }
  }
  return lines.join('\n');
}
