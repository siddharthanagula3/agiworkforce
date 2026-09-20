import type { DecisionPolicy } from '@agiworkforce/agent-core';

import {
  decisionFlagKey,
  decisionFlagMode,
  type DecisionFlagMode,
} from '@/lib/feature-flags/decision-flags';
import {
  rolloutPercentage,
  stableBucket,
  type FlagEvaluation,
} from '@/lib/feature-flags/evaluate-flags';
import type { FlagDefinition } from '@/lib/feature-flags/flag-definition';

import type { DecisionKind } from './kinds';

// Limits, not thresholds: nothing here decides whether an answer is believed.
// The deadline sits inside the headroom `after()` defers into, not beyond it.
export const DECISION_BUDGET = {
  timeoutMs: 2_000,
  maxRequestBytes: 16_000,
  maxQuestions: 8,
  maxConcurrent: 4,
} as const;

const PERCENT_SCALE = 100;
const FULL_ROLLOUT = 1;

// Read off the rule that served, whose bucket the flag evaluator already
// applied: an independently derived fraction would square the rollout.
export function decisionSampleRate(
  definition: FlagDefinition | undefined,
  evaluation: FlagEvaluation | undefined,
  nowMs: number,
): { sampleRate: number; ruleId: string | null } {
  const ruleId = evaluation?.reason === 'rule' ? evaluation.ruleId : null;
  if (!definition || ruleId === null) return { sampleRate: FULL_ROLLOUT, ruleId: null };
  const rule = definition.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return { sampleRate: FULL_ROLLOUT, ruleId };
  return { sampleRate: rolloutPercentage(rule.rollout, nowMs) / PERCENT_SCALE, ruleId };
}

// Seeded exactly as the flag evaluator seeds its own bucket, so the sample
// gate selects the population the flag selected, not a second one.
export function decisionCohort(
  kind: DecisionKind,
  ruleId: string | null,
  bucketId: string,
): number {
  const key = decisionFlagKey(kind);
  return ruleId === null
    ? stableBucket(`${key}:decision:${bucketId}`)
    : stableBucket(`${key}:${ruleId}:${bucketId}`);
}

export interface DecisionPolicyResolution {
  mode: DecisionFlagMode;
  policy: DecisionPolicy;
  cohort: number;
}

// Closed by default: an absent flag, an unreadable store and an unrecognised
// variant all resolve to disabled, and `decision.kill` overrides every kind.
export function resolveDecisionPolicy(input: {
  kind: DecisionKind;
  model: string;
  evaluations: Readonly<Record<string, FlagEvaluation>>;
  definitions: readonly FlagDefinition[];
  bucketId: string;
  nowMs: number;
}): DecisionPolicyResolution {
  const key = decisionFlagKey(input.kind);
  const mode = decisionFlagMode(input.evaluations, input.kind);
  const definition = input.definitions.find((candidate) => candidate.key === key);
  const { sampleRate, ruleId } = decisionSampleRate(
    definition,
    input.evaluations[key],
    input.nowMs,
  );
  return {
    mode,
    policy: { ...DECISION_BUDGET, mode, model: input.model, sampleRate },
    cohort: decisionCohort(input.kind, ruleId, input.bucketId),
  };
}
