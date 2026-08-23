import { SECRET_PATTERNS } from '@/lib/leak-detector';
import type { HandoffAttemptedAction, HandoffCitation, HandoffTranscriptTurn } from './types';

export const MAX_TRANSCRIPT_TURNS = 200;
export const MAX_TRANSCRIPT_CHARS = 60_000;
export const MAX_TURN_CHARS = 8_000;
export const MAX_ATTEMPTED_ACTIONS = 50;
export const MAX_CITATIONS = 25;
// Secret patterns are unanchored and scan quadratically on long token runs, so the text they
// see is bounded first; the margin keeps a secret straddling the turn cap fully redactable.
const REDACTION_SCAN_MARGIN_CHARS = 4_096;

const PATTERN_LABELS = [
  'api-key',
  'stripe-live-key',
  'stripe-test-key',
  'jwt',
  'database-url',
  'bearer-token',
];

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
  const scanLimit = MAX_TURN_CHARS + REDACTION_SCAN_MARGIN_CHARS;
  const redacted = redactSecrets(value.length > scanLimit ? value.slice(0, scanLimit) : value);
  if (redacted.length <= MAX_TURN_CHARS) return redacted;
  return `${redacted.slice(0, MAX_TURN_CHARS)}… [truncated]`;
}

export interface NormalizedTranscript {
  turns: HandoffTranscriptTurn[];
  droppedTurns: number;
}

export function normalizeTranscript(turns: HandoffTranscriptTurn[]): NormalizedTranscript {
  let dropped = 0;
  let retained = turns;
  if (retained.length > MAX_TRANSCRIPT_TURNS) {
    dropped += retained.length - MAX_TRANSCRIPT_TURNS;
    retained = retained.slice(-MAX_TRANSCRIPT_TURNS);
  }

  let working = retained.map((turn) => ({
    role: turn.role,
    content: clampTurnText(turn.content),
    at: turn.at,
  }));

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
