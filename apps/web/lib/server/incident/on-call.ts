import 'server-only';

import type { PageTarget } from './pager';

export const ONCALL_ROTATION_ENV = 'AGI_ONCALL_ROTATION';
export const ONCALL_ROTATION_START_ENV = 'AGI_ONCALL_ROTATION_START';
export const ONCALL_SHIFT_HOURS_ENV = 'AGI_ONCALL_SHIFT_HOURS';
export const ONCALL_ESCALATE_AFTER_MINUTES_ENV = 'AGI_ONCALL_ESCALATE_AFTER_MINUTES';

const DEFAULT_SHIFT_HOURS = 168;
const DEFAULT_ESCALATE_AFTER_MINUTES = 15;
const MIN_SHIFT_HOURS = 1;
const MAX_SHIFT_HOURS = 8_760;
const MIN_ESCALATE_MINUTES = 1;
const MAX_ESCALATE_MINUTES = 1_440;
const HOUR_MS = 60 * 60 * 1_000;
const HANDLE_SEPARATOR = ':';
const RESPONDER_SEPARATOR = ',';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const ESCALATION_LEVELS = {
  primary: 1,
  secondary: 2,
  everyone: 3,
} as const;

export type EscalationLevel = (typeof ESCALATION_LEVELS)[keyof typeof ESCALATION_LEVELS];

export interface OnCallRotation {
  responders: readonly PageTarget[];
  startedAtMs: number;
  shiftHours: number;
  escalateAfterMinutes: number;
}

type Environment = Record<string, string | undefined>;

function environment(): Environment {
  return typeof process === 'undefined' ? {} : process.env;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function readNumber(env: Environment, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseResponders(raw: string | undefined): PageTarget[] {
  if (!raw) return [];
  return raw
    .split(RESPONDER_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.lastIndexOf(HANDLE_SEPARATOR);
      const handle = separator > 0 ? entry.slice(0, separator).trim() : '';
      const email = separator > 0 ? entry.slice(separator + 1).trim() : entry;
      return { handle: handle || email, email };
    })
    .filter((responder) => EMAIL_PATTERN.test(responder.email));
}

export function resolveOnCallRotation(env: Environment = environment()): OnCallRotation {
  const started = Date.parse(env[ONCALL_ROTATION_START_ENV] ?? '');
  return {
    responders: parseResponders(env[ONCALL_ROTATION_ENV]),
    startedAtMs: Number.isFinite(started) ? started : 0,
    shiftHours: clamp(
      readNumber(env, ONCALL_SHIFT_HOURS_ENV, DEFAULT_SHIFT_HOURS),
      MIN_SHIFT_HOURS,
      MAX_SHIFT_HOURS,
    ),
    escalateAfterMinutes: clamp(
      readNumber(env, ONCALL_ESCALATE_AFTER_MINUTES_ENV, DEFAULT_ESCALATE_AFTER_MINUTES),
      MIN_ESCALATE_MINUTES,
      MAX_ESCALATE_MINUTES,
    ),
  };
}

function shiftIndex(rotation: OnCallRotation, at: Date): number {
  const elapsed = at.getTime() - rotation.startedAtMs;
  const shifts = Math.floor(elapsed / (rotation.shiftHours * HOUR_MS));
  const count = rotation.responders.length;
  return ((shifts % count) + count) % count;
}

/**
 * Who holds the pager at a given instant, from a rotation that is
 * configuration rather than a name in the source tree. An unconfigured
 * rotation answers with nobody, and the caller falls back to the monitored
 * mailbox: an alert addressed to a person who does not exist reaches no one.
 */
export function responderAt(at: Date, rotation = resolveOnCallRotation()): PageTarget | null {
  if (rotation.responders.length === 0) return null;
  return rotation.responders[shiftIndex(rotation, at)] ?? null;
}

/**
 * Level 1 is whoever is on call, level 2 adds the next responder in the
 * rotation, level 3 is everyone. An escalation that stops at one person is
 * indistinguishable from no escalation when that person is asleep.
 */
export function respondersForLevel(
  level: EscalationLevel,
  at: Date,
  rotation = resolveOnCallRotation(),
): readonly PageTarget[] {
  const count = rotation.responders.length;
  if (count === 0) return [];
  if (level >= ESCALATION_LEVELS.everyone) return rotation.responders;

  const primary = shiftIndex(rotation, at);
  const chosen = [rotation.responders[primary]];
  if (level >= ESCALATION_LEVELS.secondary && count > 1) {
    chosen.push(rotation.responders[(primary + 1) % count]);
  }
  return chosen.filter((responder): responder is PageTarget => responder !== undefined);
}

export function levelForElapsedMinutes(
  elapsedMinutes: number,
  rotation = resolveOnCallRotation(),
): EscalationLevel {
  if (elapsedMinutes >= rotation.escalateAfterMinutes * ESCALATION_LEVELS.secondary) {
    return ESCALATION_LEVELS.everyone;
  }
  if (elapsedMinutes >= rotation.escalateAfterMinutes) return ESCALATION_LEVELS.secondary;
  return ESCALATION_LEVELS.primary;
}
