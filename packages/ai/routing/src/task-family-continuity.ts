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
  | 'family_pinned'
  | 'escalated_on_failure'
  /** Failure signal but the candidate sits at the same rung. */
  | 'lateral_move_blocked'
  /** Failure signal but the candidate sits lower. Never allowed silently. */
  | 'downgrade_blocked'
  /** Failure signal and the pin is already at the top rung. */
  | 'ladder_exhausted'
  /** Failure signal but the candidate is not on the ladder at all. */
  | 'candidate_off_ladder'
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
