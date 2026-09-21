/**
 * Every running experiment, declared once.
 *
 * An experiment is not a second way to hand a change out: it is one flag with a
 * weighted split, so assignment is the flag evaluator's stable bucket and there
 * is no second mechanism that could put one person in two arms. What this
 * registry adds is everything the flag cannot say, the question being asked,
 * who is asking it, who is never in it, what would stop it, and what was
 * decided, so an experiment that ended has a readable answer rather than a flag
 * somebody eventually deleted.
 *
 * Exposure is deliberately separate from assignment. A subject is assigned the
 * moment the flag is evaluated, which happens on every request; they are
 * exposed only when they meet the thing being tested. Recording the first as
 * the second inflates every denominator and makes the result unreadable.
 *
 * @module experiment-registry
 */

import registryJson from './experiment-registry.json' with { type: 'json' };
import type { ProductDomain } from './domain-registry';
import type { WorkspaceFeature } from './enterprise/workspace-controls';

/** The two subjects an experiment may be bucketed by; both are flag bucket keys. */
export const EXPERIMENT_ASSIGNMENT_KEYS = ['user', 'workspace'] as const;

export type ExperimentAssignmentKey = (typeof EXPERIMENT_ASSIGNMENT_KEYS)[number];

export const EXPERIMENT_RESULTS = ['pending', 'win', 'loss', 'inconclusive'] as const;

export type ExperimentResult = (typeof EXPERIMENT_RESULTS)[number];

export const EXPERIMENT_DECISIONS = ['pending', 'ship', 'revert', 'extend', 'abandon'] as const;

export type ExperimentDecision = (typeof EXPERIMENT_DECISIONS)[number];

/** The arm the product already had. Every experiment carries it under this name. */
export const EXPERIMENT_CONTROL_VARIANT = 'control';

/**
 * Domains an experiment may never be run on. What a customer is charged, what
 * their plan carries and what the model refuses are not questions to answer
 * with a coin toss on half the population.
 */
export const EXPERIMENT_FORBIDDEN_DOMAINS = [
  'billing',
  'entitlements',
  'usage',
  'safety',
  'abuse',
  'approvals',
  'policy',
] as const satisfies readonly ProductDomain[];

export interface ExperimentDefinition {
  hypothesis: string;
  /** A path in this repository, so the owner cannot outlive the code. */
  owner: string;
  domain: ProductDomain;
  /** The administrator control that must allow it, so a workspace can refuse. */
  policy: WorkspaceFeature | null;
  population: string;
  exclusions: readonly string[];
  /** The arms, control first. These are the flag's variants and nothing else. */
  variants: readonly string[];
  assignmentKey: ExperimentAssignmentKey;
  /** Recorded when the subject meets the thing, never when they are assigned. */
  exposureEvent: string;
  primaryMetric: string;
  guardrails: readonly string[];
  startAt: string;
  endAt: string;
  result: ExperimentResult;
  decision: ExperimentDecision;
}

export const EXPERIMENT_DEFINITIONS = registryJson.experiments as Readonly<
  Record<string, ExperimentDefinition>
>;

export const EXPERIMENT_IDS: readonly string[] = Object.keys(EXPERIMENT_DEFINITIONS);

export function experimentDefinition(id: string): ExperimentDefinition | null {
  return EXPERIMENT_DEFINITIONS[id] ?? null;
}

export interface ExperimentAssignment {
  experiment: string;
  variant: string;
  control: boolean;
}

/**
 * The arm this subject is in, read from the one flag that carries the split. A
 * variant the registry does not declare is treated as the control: an operator
 * editing the flag cannot invent an arm the analysis has no column for.
 */
export function experimentAssignment(
  id: string,
  definition: ExperimentDefinition,
  variant: string | null | undefined,
): ExperimentAssignment {
  const known = typeof variant === 'string' && definition.variants.includes(variant);
  const resolved = known ? variant : EXPERIMENT_CONTROL_VARIANT;
  return {
    experiment: id,
    variant: resolved,
    control: resolved === EXPERIMENT_CONTROL_VARIANT,
  };
}

export interface ExperimentExposure {
  event: string;
  experiment: string;
  variant: string;
}

/**
 * The event to record at the moment the subject meets the thing being tested.
 * Nothing here assigns, so an exposure can never be the reason somebody entered
 * the experiment.
 */
export function experimentExposure(
  assignment: ExperimentAssignment,
  definition: ExperimentDefinition,
): ExperimentExposure {
  return {
    event: definition.exposureEvent,
    experiment: assignment.experiment,
    variant: assignment.variant,
  };
}

export interface ExperimentRunContext {
  /** Whether the workspace's administrator allows the feature it varies. */
  policyAllows: boolean;
  nowMs: number;
}

/**
 * Why this experiment may not run for this subject right now. An administrator
 * who has turned a feature off has turned off the experiment on it too: being
 * in a test is not a way around the control they set.
 */
export function experimentBlockers(
  id: string,
  definition: ExperimentDefinition,
  context: ExperimentRunContext,
): string[] {
  const blockers: string[] = [];
  if (definition.policy !== null && !context.policyAllows) {
    blockers.push(
      `${id} varies ${definition.policy}, which this workspace has turned off, so it does not run here`,
    );
  }
  const start = Date.parse(definition.startAt);
  const end = Date.parse(definition.endAt);
  if (Number.isFinite(start) && context.nowMs < start) {
    blockers.push(`${id} does not start until ${definition.startAt}`);
  }
  if (Number.isFinite(end) && context.nowMs >= end) {
    blockers.push(`${id} ended on ${definition.endAt} and assigns nobody`);
  }
  return blockers;
}
