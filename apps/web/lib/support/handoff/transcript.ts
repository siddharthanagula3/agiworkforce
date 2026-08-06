/**
 * @file transcript.ts
 *
 * Normalizes a support conversation before it is written to Neon or mailed to a
 * human. Two jobs, both mandatory:
 *
 *  1. REDACT. Users paste their own API keys into support chats constantly.
 *     `assertNoLeaks` throws, which would reject the escalation — the wrong
 *     answer, because the user still needs help. So this shares
 *     `SECRET_PATTERNS` with the detector and replaces instead of rejecting.
 *     Redaction runs BEFORE the database write and BEFORE the email body is
 *     built, so a secret never lands in either.
 *  2. CAP. One escalation must not be able to write an unbounded blob into the
 *     table or an unbounded body into an email. Oldest turns are dropped first
 *     (a human needs the recent context most) and the drop is announced with an
 *     explicit marker rather than silently truncating.
 */

import { SECRET_PATTERNS } from '@/lib/leak-detector';
import type { HandoffAttemptedAction, HandoffCitation, HandoffTranscriptTurn } from './types';

export const MAX_TRANSCRIPT_TURNS = 200;
export const MAX_TRANSCRIPT_CHARS = 60_000;
export const MAX_TURN_CHARS = 8_000;
export const MAX_ATTEMPTED_ACTIONS = 50;
export const MAX_CITATIONS = 25;

/** Human-readable label per pattern index, used in the replacement marker. */
const PATTERN_LABELS = [
  'api-key',
  'stripe-live-key',
  'stripe-test-key',
  'jwt',
  'database-url',
  'bearer-token',
];

/**
 * Replace every secret-shaped run with `[redacted:<label>]`.
 * Patterns are rebuilt with the global flag; the shared list is non-global so a
 * `lastIndex` cannot leak between callers.
 */
export function redactSecrets(value: string): string {
  let out = value;
  SECRET_PATTERNS.forEach((pattern, index) => {
    const label = PATTERN_LABELS[index] ?? 'secret';
    const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    out = out.replace(global, `[redacted:${label}]`);
  });
  return out;
}

function clampTurnText(value: string): string {
  const redacted = redactSecrets(value);
  if (redacted.length <= MAX_TURN_CHARS) return redacted;
  return `${redacted.slice(0, MAX_TURN_CHARS)}… [truncated]`;
}

export interface NormalizedTranscript {
  turns: HandoffTranscriptTurn[];
  /** How many oldest turns were dropped to fit the caps. */
  droppedTurns: number;
}

/**
 * Redact, clamp per-turn, then drop OLDEST turns until both the turn-count and
 * total-character caps hold. The caller renders `droppedTurns` as an explicit
 * "[N earlier turns omitted]" marker so the human knows the record is partial.
 */
export function normalizeTranscript(turns: HandoffTranscriptTurn[]): NormalizedTranscript {
  const clamped = turns.map((turn) => ({
    role: turn.role,
    content: clampTurnText(turn.content),
    at: turn.at,
  }));

  let dropped = 0;
  let working = clamped;

  if (working.length > MAX_TRANSCRIPT_TURNS) {
    dropped += working.length - MAX_TRANSCRIPT_TURNS;
    working = working.slice(-MAX_TRANSCRIPT_TURNS);
  }

  let total = working.reduce((sum, turn) => sum + turn.content.length, 0);
  while (total > MAX_TRANSCRIPT_CHARS && working.length > 1) {
    const [oldest, ...rest] = working;
    total -= oldest!.content.length;
    working = rest;
    dropped += 1;
  }

  return { turns: working, droppedTurns: dropped };
}

export function normalizeAttemptedActions(
  actions: HandoffAttemptedAction[] | undefined,
): HandoffAttemptedAction[] {
  if (!actions?.length) return [];
  return actions.slice(-MAX_ATTEMPTED_ACTIONS).map((action) => ({
    action: redactSecrets(action.action).slice(0, 200),
    outcome: action.outcome,
    ...(action.detail ? { detail: redactSecrets(action.detail).slice(0, 1_000) } : {}),
    at: action.at,
  }));
}

export function normalizeCitations(citations: HandoffCitation[] | undefined): HandoffCitation[] {
  if (!citations?.length) return [];
  return citations.slice(0, MAX_CITATIONS).map((citation) => ({
    title: redactSecrets(citation.title).slice(0, 300),
    url: redactSecrets(citation.url).slice(0, 2_000),
  }));
}

export function normalizeSummary(summary: string): string {
  return redactSecrets(summary).slice(0, 1_000);
}
