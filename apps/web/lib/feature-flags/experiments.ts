import {
  EXPERIMENT_CONTROL_VARIANT,
  EXPERIMENT_DEFINITIONS,
  EXPERIMENT_IDS,
  experimentAssignment,
  experimentBlockers,
  experimentDefinition,
  experimentExposure,
  type ExperimentAssignment,
  type ExperimentDefinition,
  type ExperimentExposure,
} from '@agiworkforce/types';

import type { FlagEvaluation } from './evaluate-flags';
import { FLAG_OFF_VARIANT, type FlagDefinitionInput, type FlagRule } from './flag-definition';

export const EXPERIMENT_FLAG_PREFIX = 'experiment.';
export const EXPERIMENT_RULE_ID = 'arms';

const EXPERIMENT_ID = /^[a-z][a-z0-9_]*$/;
const EVEN_WEIGHT = 1;

export function experimentFlagKey(id: string): string {
  return `${EXPERIMENT_FLAG_PREFIX}${id}`;
}

export function parseExperimentFlagKey(key: string): string | null {
  if (!key.startsWith(EXPERIMENT_FLAG_PREFIX)) return null;
  const id = key.slice(EXPERIMENT_FLAG_PREFIX.length);
  return EXPERIMENT_ID.test(id) && experimentDefinition(id) !== null ? id : null;
}

/**
 * The one flag that carries an experiment. The arms are the registry's variants
 * and the bucket key is the registry's subject, so the population an analysis
 * reads back is the population the evaluator drew. `off` is declared because
 * every flag declares it: engaging the kill switch puts everybody on control
 * rather than leaving them in an arm nobody is still measuring.
 */
export function experimentFlagDefinition(
  id: string,
  definition: ExperimentDefinition,
): FlagDefinitionInput {
  const rule: FlagRule = {
    id: EXPERIMENT_RULE_ID,
    conditions: {},
    bucketBy: definition.assignmentKey,
    split: definition.variants.map((variant) => ({ variant, weight: EVEN_WEIGHT })),
  };
  return {
    key: experimentFlagKey(id),
    description: definition.hypothesis,
    killSwitch: false,
    variants: [...definition.variants, FLAG_OFF_VARIANT],
    defaultVariant: EXPERIMENT_CONTROL_VARIANT,
    rules: [rule],
    expiresAt: definition.endAt,
  };
}

/**
 * Which arm each running experiment put this request in. Nothing here records
 * anything: a subject is assigned on every request and exposed only when they
 * meet the thing, and counting the first as the second makes every rate wrong.
 */
export function assignedExperiments(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
): ExperimentAssignment[] {
  const assignments: ExperimentAssignment[] = [];
  for (const id of EXPERIMENT_IDS) {
    const definition = EXPERIMENT_DEFINITIONS[id];
    if (definition === undefined) continue;
    assignments.push(
      experimentAssignment(id, definition, evaluations[experimentFlagKey(id)]?.variant),
    );
  }
  return assignments;
}

/** The exposure to record once the subject has actually met the variation. */
export function exposureFor(assignment: ExperimentAssignment): ExperimentExposure | null {
  const definition = experimentDefinition(assignment.experiment);
  return definition === null ? null : experimentExposure(assignment, definition);
}

export function experimentsBlockedFor(
  policyAllows: (definition: ExperimentDefinition) => boolean,
  nowMs: number = Date.now(),
): string[] {
  return EXPERIMENT_IDS.flatMap((id) => {
    const definition = EXPERIMENT_DEFINITIONS[id];
    return definition === undefined
      ? []
      : experimentBlockers(id, definition, { policyAllows: policyAllows(definition), nowMs });
  });
}

export function isExperimentFlagKey(key: string): boolean {
  return parseExperimentFlagKey(key) !== null;
}
