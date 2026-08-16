/**
 * Session stickiness and escalation-only switching for the task-family stage.
 *
 * Design source of truth:
 * `docs/design/execution-plan-contract-and-cpst-2026-08-05.md` §2.3 (session
 * stickiness is already policy — `auto.continuity` is all-true — and what is
 * missing is measuring whether honouring it was the cheaper choice), §3 field
 * 11 (`fallbackPolicy.escalateOnly: true` is the default for this router work:
 * "a switch may only move up the ladder, never sideways"), and §5 Stage 2.
 *
 * WHY THIS IS SEPARATE FROM `resolveAutoRoute`
 * -------------------------------------------
 * `resolveAutoRoute` is pure and stateless — it has no session. Continuity
 * needs the session's pinned route and the previous attempt's failure signal,
 * both of which only the caller holds. So the resolver produces the ladder
 * (`TaskFamilyOrdering.escalationLadder`) and this module decides, from the
 * caller's session state, whether to stay put, move up, or start over.
 *
 * WHAT COUNTS AS A FAILURE SIGNAL
 * -------------------------------
 * Nothing invented. The managed-cloud path already computes a `fallbackReason`
 * string when it swaps model mid-request
 * (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`). That
 * string, present, IS the failure signal. Absent means no failure, and absent
 * never permits a switch.
 *
 * THE TWO RULES
 * -------------
 *  1. **Pinned by default.** Same family, no failure signal → the session keeps
 *     its model even when this turn's router would have preferred a different
 *     one. Switching models mid-conversation is a guaranteed prompt-cache miss
 *     that re-bills the whole prefix at full input price
 *     (`assessModelSwitchCache`), so a switch that buys nothing costs real money.
 *  2. **Escalation only.** With a failure signal, the session may move UP the
 *     ladder and only up. A lateral move buys nothing and pays the full
 *     cache-reset penalty; a downward move is a silent quality downgrade
 *     mid-session, which Decision #10 forbids outright. Both are refused with
 *     their own reason code rather than being quietly allowed.
 *
 * Pure: no I/O, no clock, no platform dependency.
 *
 * @module routing/task-family-continuity
 * @packageDocumentation
 */

import { assessModelSwitchCache, type ModelSwitchCacheAssessment } from './model-switch-cache';
import type { TaskFamily } from './task-family';

export interface TaskFamilySessionRoute {
  family: TaskFamily;
  modelKey: string;
  priorTurnCount: number;
}

export interface TaskFamilyContinuityInput {
  session: TaskFamilySessionRoute | null;
  nextFamily: TaskFamily | null;
  candidateModelKey: string;
  ladder: readonly string[];
  failureSignal?: string | null;
}

export type TaskFamilyContinuityAction = 'start' | 'pin' | 'escalate' | 'hold' | 'reclassify';

export type TaskFamilyContinuityReason =
  | 'session_started'
  /** Same family, no failure — the pin is kept. */
  | 'family_pinned'
  /** Failure signal plus a strictly higher rung — the pin moves up. */
  | 'escalated_on_failure'
  /** Failure signal but the candidate sits at the same rung. */
  | 'lateral_move_blocked'
  /** Failure signal but the candidate sits lower. Never allowed silently. */
  | 'downgrade_blocked'
  /** Failure signal and the pin is already at the top rung. */
  | 'ladder_exhausted'
  /** Failure signal but the candidate is not on the ladder at all. */
  | 'candidate_off_ladder'
  /** The family changed — the pin is released and Auto re-evaluates. */
  | 'family_changed'
  /** The fast path declined this turn; continuity does not apply. */
  | 'family_unclassified';

export interface TaskFamilyContinuityDecision {
  action: TaskFamilyContinuityAction;
  reasonCode: TaskFamilyContinuityReason;
  modelKey: string;
  rung: number;
  cache?: ModelSwitchCacheAssessment;
}

function rungOf(ladder: readonly string[], modelKey: string): number {
  return ladder.indexOf(modelKey);
}

function hasFailureSignal(signal: string | null | undefined): boolean {
  return typeof signal === 'string' && signal.trim().length > 0;
}

export function decideTaskFamilyContinuity(
  input: TaskFamilyContinuityInput,
): TaskFamilyContinuityDecision {
  const { session, nextFamily, candidateModelKey, ladder } = input;

  if (nextFamily === null) {
    return {
      action: 'reclassify',
      reasonCode: 'family_unclassified',
      modelKey: candidateModelKey,
      rung: rungOf(ladder, candidateModelKey),
    };
  }

  if (session === null) {
    return {
      action: 'start',
      reasonCode: 'session_started',
      modelKey: candidateModelKey,
      rung: rungOf(ladder, candidateModelKey),
    };
  }

  if (session.family !== nextFamily) {
    const decision: TaskFamilyContinuityDecision = {
      action: 'reclassify',
      reasonCode: 'family_changed',
      modelKey: candidateModelKey,
      rung: rungOf(ladder, candidateModelKey),
    };
    if (candidateModelKey !== session.modelKey) {
      decision.cache = assessModelSwitchCache({
        priorModelId: session.modelKey,
        nextModelId: candidateModelKey,
        priorTurnCount: session.priorTurnCount,
      });
    }
    return decision;
  }

  const pinnedRung = rungOf(ladder, session.modelKey);
  const held: TaskFamilyContinuityDecision = {
    action: 'hold',
    reasonCode: 'family_pinned',
    modelKey: session.modelKey,
    rung: pinnedRung,
  };

  if (!hasFailureSignal(input.failureSignal)) {
    return { ...held, action: 'pin', reasonCode: 'family_pinned' };
  }

  if (pinnedRung >= 0 && pinnedRung === ladder.length - 1) {
    return { ...held, reasonCode: 'ladder_exhausted' };
  }

  const candidateRung = rungOf(ladder, candidateModelKey);
  if (candidateRung < 0) {
    return { ...held, reasonCode: 'candidate_off_ladder' };
  }
  if (candidateRung === pinnedRung) {
    return { ...held, reasonCode: 'lateral_move_blocked' };
  }
  if (candidateRung < pinnedRung) {
    return { ...held, reasonCode: 'downgrade_blocked' };
  }

  return {
    action: 'escalate',
    reasonCode: 'escalated_on_failure',
    modelKey: candidateModelKey,
    rung: candidateRung,
    cache: assessModelSwitchCache({
      priorModelId: session.modelKey,
      nextModelId: candidateModelKey,
      priorTurnCount: session.priorTurnCount,
    }),
  };
}

export function applyTaskFamilyContinuity(
  session: TaskFamilySessionRoute | null,
  family: TaskFamily | null,
  decision: TaskFamilyContinuityDecision,
): TaskFamilySessionRoute | null {
  if (family === null) return session;
  if (decision.action === 'pin' || decision.action === 'hold') {
    return session;
  }
  return { family, modelKey: decision.modelKey, priorTurnCount: 0 };
}
