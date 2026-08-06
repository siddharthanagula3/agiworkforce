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

/** The route a session is currently pinned to. */
export interface TaskFamilySessionRoute {
  /** The family that produced this pin. A different family releases it. */
  family: TaskFamily;
  /** The pinned model key. */
  modelKey: string;
  /**
   * Assistant turns already served on this pin — the cached prefix that a
   * switch would throw away. Feeds `assessModelSwitchCache` unchanged.
   */
  priorTurnCount: number;
}

/** Inputs for one continuity decision. */
export interface TaskFamilyContinuityInput {
  /** The session's existing pin, or `null` for the first turn. */
  session: TaskFamilySessionRoute | null;
  /** This turn's family, or `null` when the fast path declined. */
  nextFamily: TaskFamily | null;
  /** The model this turn's router would pick on its own. */
  candidateModelKey: string;
  /**
   * The escalation ladder, LOWEST capability first — normally
   * `TaskFamilyOrdering.escalationLadder`. Rungs are model keys.
   */
  ladder: readonly string[];
  /**
   * The previous attempt's failure signal (the existing `fallbackReason`
   * event, a provider error string, …). Absent/empty means no failure, and no
   * failure means no switch.
   */
  failureSignal?: string | null;
}

/** What the session should do this turn. */
export type TaskFamilyContinuityAction = 'start' | 'pin' | 'escalate' | 'hold' | 'reclassify';

/** Explainability vocabulary for continuity (Decision #10). */
export type TaskFamilyContinuityReason =
  /** No pin existed; this turn establishes one. */
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

/** The continuity decision. `modelKey` is the model the caller must use. */
export interface TaskFamilyContinuityDecision {
  action: TaskFamilyContinuityAction;
  reasonCode: TaskFamilyContinuityReason;
  /** The model to execute with. Equal to the pin unless the action moves it. */
  modelKey: string;
  /** Ladder index of `modelKey`, or `-1` when it is not on the ladder. */
  rung: number;
  /**
   * Cache consequence, present only when the decision actually changes the
   * model on a session that had prior turns. Priced by the one cross-surface
   * function that owns this judgement, so web/desktop/mobile agree.
   */
  cache?: ModelSwitchCacheAssessment;
}

function rungOf(ladder: readonly string[], modelKey: string): number {
  return ladder.indexOf(modelKey);
}

function hasFailureSignal(signal: string | null | undefined): boolean {
  return typeof signal === 'string' && signal.trim().length > 0;
}

/**
 * Decide whether the session keeps its pinned model, escalates, or starts over.
 *
 * Never returns a model the caller did not already offer: the result is either
 * the existing pin or `candidateModelKey`. This function cannot widen
 * admission because it never picks a model — it only chooses between two the
 * caller already resolved through `evaluateEligibility`.
 */
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

  // Same family, no failure → the pin stands, whatever this turn preferred.
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

/**
 * Fold a decision back into the session pin the caller should store for the
 * next turn. `hold` and `pin` keep the existing turn count; a move resets it,
 * because the new model starts with a cold prompt cache.
 */
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
