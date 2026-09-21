/**
 * The receipt every browser and computer-use action leaves behind.
 *
 * `succeeded` is not something an agent may assert. It is only reachable by
 * settling an attempt with a check that actually passed, so a run that never
 * looked at the result is recorded as failed and unverified rather than as a
 * success nobody measured.
 */

import type { BrowserSessionKind } from './browser-session';

export const AUTOMATION_OUTCOME_STATUSES = ['attempted', 'succeeded', 'refused', 'failed'] as const;

export type AutomationOutcomeStatus = (typeof AUTOMATION_OUTCOME_STATUSES)[number];

export function isAutomationOutcomeStatus(value: unknown): value is AutomationOutcomeStatus {
  return (
    typeof value === 'string' && (AUTOMATION_OUTCOME_STATUSES as readonly string[]).includes(value)
  );
}

export const AUTOMATION_SURFACES = ['extension', 'desktop', 'cloud'] as const;

export type AutomationSurface = (typeof AUTOMATION_SURFACES)[number];

/** Receipts a surface may send, and the ingest may accept, in one request. */
export const AUTOMATION_OUTCOME_MAX_BATCH = 200;

/** Longest reason, check or observation a receipt may carry. */
export const AUTOMATION_OUTCOME_MAX_REASON_CHARS = 300;

/** Longest target a receipt may carry: an origin or an app bundle id. */
export const AUTOMATION_OUTCOME_MAX_TARGET_CHARS = 300;

/** What was checked after the action, and whether the check passed. */
export interface AutomationVerification {
  readonly check: string;
  readonly passed: boolean;
  readonly observed?: string;
}

export interface AutomationAttempt {
  readonly runId: string;
  readonly action: string;
  readonly surface: AutomationSurface;
  readonly deviceId: string | null;
  readonly sessionKind: BrowserSessionKind | null;
  readonly startedAtMs: number;
}

export interface AutomationOutcome extends AutomationAttempt {
  readonly status: AutomationOutcomeStatus;
  readonly reason: string;
  readonly verified: boolean;
  readonly verification: AutomationVerification | null;
  readonly settledAtMs: number;
  readonly durationMs: number;
}

export type AutomationSettlement =
  | { readonly claim: 'succeeded'; readonly verification: AutomationVerification }
  | { readonly claim: 'refused'; readonly reason: string }
  | { readonly claim: 'failed'; readonly reason: string };

export interface StartAutomationAttemptInput {
  readonly runId: string;
  readonly action: string;
  readonly surface: AutomationSurface;
  readonly deviceId?: string | null;
  readonly sessionKind?: BrowserSessionKind | null;
  readonly startedAtMs?: number;
}

export function startAutomationAttempt(input: StartAutomationAttemptInput): AutomationAttempt {
  return {
    runId: input.runId,
    action: input.action,
    surface: input.surface,
    deviceId: input.deviceId ?? null,
    sessionKind: input.sessionKind ?? null,
    startedAtMs: input.startedAtMs ?? Date.now(),
  };
}

export const UNVERIFIED_SUCCESS_REASON =
  'The action reported success but its result was never checked, so it is recorded as unverified.';

export function attemptedAutomationOutcome(
  attempt: AutomationAttempt,
  nowMs: number = Date.now(),
): AutomationOutcome {
  return {
    ...attempt,
    status: 'attempted',
    reason: 'The action is in flight.',
    verified: false,
    verification: null,
    settledAtMs: nowMs,
    durationMs: Math.max(0, nowMs - attempt.startedAtMs),
  };
}

/**
 * Turns an attempt into its receipt. A `succeeded` claim whose check did not
 * pass settles as `failed`, which is the whole point of routing through here.
 */
export function settleAutomationAttempt(
  attempt: AutomationAttempt,
  settlement: AutomationSettlement,
  nowMs: number = Date.now(),
): AutomationOutcome {
  const base = {
    ...attempt,
    settledAtMs: nowMs,
    durationMs: Math.max(0, nowMs - attempt.startedAtMs),
  };

  if (settlement.claim !== 'succeeded') {
    return {
      ...base,
      status: settlement.claim,
      reason: settlement.reason,
      verified: false,
      verification: null,
    };
  }

  const { verification } = settlement;
  if (!verification.passed) {
    return {
      ...base,
      status: 'failed',
      reason: `${UNVERIFIED_SUCCESS_REASON} Check: ${verification.check}.`,
      verified: false,
      verification,
    };
  }

  return {
    ...base,
    status: 'succeeded',
    reason: `Confirmed by: ${verification.check}.`,
    verified: true,
    verification,
  };
}

export interface AutomationOutcomeSummary {
  readonly total: number;
  readonly attempted: number;
  readonly succeeded: number;
  readonly refused: number;
  readonly failed: number;
  readonly unverified: number;
  readonly successRate: number;
}

/**
 * Refusals are excluded from the denominator: a run the policy stopped is not a
 * failure of the automation, and counting it as one hides real regressions.
 */
export function automationOutcomeSuccessRate(outcomes: readonly AutomationOutcome[]): number {
  const settled = outcomes.filter(
    (outcome) => outcome.status === 'succeeded' || outcome.status === 'failed',
  );
  if (settled.length === 0) return 0;
  const succeeded = settled.filter((outcome) => outcome.status === 'succeeded').length;
  return succeeded / settled.length;
}

export function summarizeAutomationOutcomes(
  outcomes: readonly AutomationOutcome[],
): AutomationOutcomeSummary {
  const count = (status: AutomationOutcomeStatus): number =>
    outcomes.filter((outcome) => outcome.status === status).length;

  return {
    total: outcomes.length,
    attempted: count('attempted'),
    succeeded: count('succeeded'),
    refused: count('refused'),
    failed: count('failed'),
    unverified: outcomes.filter((outcome) => outcome.verification !== null && !outcome.verified)
      .length,
    successRate: automationOutcomeSuccessRate(outcomes),
  };
}
