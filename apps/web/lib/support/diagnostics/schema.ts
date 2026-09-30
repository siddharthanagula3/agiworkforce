import { redactSecrets } from '@/lib/redaction';
import { redactTranscriptText as redactLeakPatterns } from '@/lib/support/handoff/transcript';
import {
  MAX_DIAGNOSTIC_EVENTS,
  MAX_DIAGNOSTIC_MESSAGE_CHARS,
  supportDiagnosticsSchema,
  type SupportDiagnostics,
} from '@agiworkforce/cloud-contracts/support';

// Two passes because the two pattern sets are not a superset of each other:
// lib/redaction covers addresses and vendor tokens, leak-detector covers database URLs.
function clampMessage(message: string): string {
  const redacted = redactLeakPatterns(redactSecrets(message));
  return redacted.length <= MAX_DIAGNOSTIC_MESSAGE_CHARS
    ? redacted
    : `${redacted.slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS)}… [truncated]`;
}

/**
 * A page path can carry a share token or a query string the user pasted, so it
 * is reduced to its path before anything stores it.
 */
function safePath(value: string | null): string | null {
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/u)[0] ?? '';
  return withoutQuery.length > 0 ? withoutQuery.slice(0, 500) : null;
}

export interface ServerDiagnosticFacts {
  releaseSha?: string | null;
  deployEnv?: string | null;
}

/**
 * `server` carries the facts only the process that served the request can know.
 * A browser that guessed at its own build would report the guess, so the
 * collector leaves them null and they are filled in here.
 */
export function normalizeDiagnostics(
  input: unknown,
  server: ServerDiagnosticFacts = {},
): SupportDiagnostics | null {
  const parsed = supportDiagnosticsSchema.safeParse(input);
  if (!parsed.success) return null;

  const value = parsed.data;
  return {
    ...value,
    releaseSha: server.releaseSha ?? value.releaseSha,
    deployEnv: server.deployEnv ?? value.deployEnv,
    pagePath: safePath(value.pagePath),
    recentEvents: value.recentEvents.slice(-MAX_DIAGNOSTIC_EVENTS).map((event) => ({
      ...event,
      message: clampMessage(event.message),
    })),
  };
}
