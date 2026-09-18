import { z } from 'zod';

import { redactSecrets } from '@/lib/redaction';
import { redactSecrets as redactLeakPatterns } from '@/lib/support/handoff/transcript';
import {
  DIAGNOSTIC_SURFACES,
  MAX_DIAGNOSTIC_EVENTS,
  MAX_DIAGNOSTIC_MESSAGE_CHARS,
  type SupportDiagnostics,
} from './types';

/**
 * The server never trusts a diagnostics bundle. It arrives from a client that a
 * user or an extension can edit, so it is validated, clamped and re-redacted
 * here before it is stored, whatever the collector already did.
 */

const eventSchema = z
  .object({
    at: z.string().datetime(),
    kind: z.enum(['error', 'warning', 'request_failed']),
    message: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DIAGNOSTIC_MESSAGE_CHARS * 4),
  })
  .strict();

export const supportDiagnosticsSchema = z
  .object({
    collectedAt: z.string().datetime(),
    surface: z.enum(DIAGNOSTIC_SURFACES),
    appVersion: z.string().max(100).nullable(),
    releaseSha: z.string().max(100).nullable(),
    deployEnv: z.string().max(50).nullable(),
    platform: z.string().max(200).nullable(),
    locale: z.string().max(50).nullable(),
    timeZone: z.string().max(100).nullable(),
    viewport: z
      .object({
        width: z.number().int().min(0).max(100_000),
        height: z.number().int().min(0).max(100_000),
      })
      .strict()
      .nullable(),
    online: z.boolean().nullable(),
    pagePath: z.string().max(500).nullable(),
    conversationId: z.string().max(200).nullable(),
    recentEvents: z.array(eventSchema).max(MAX_DIAGNOSTIC_EVENTS * 4),
  })
  .strict();

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
