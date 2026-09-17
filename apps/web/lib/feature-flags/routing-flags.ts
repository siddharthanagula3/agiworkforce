import type { FlagEvaluation } from './evaluate-flags';

export const ROUTING_FLAG_PREFIX = 'routing.';

export const ROUTING_FLAG_KEYS = {
  observedHealth: 'routing.observed_health',
  canary: 'routing.canary',
  shadow: 'routing.shadow',
} as const;

const CANARY_COHORT_FLAG_PREFIX = `${ROUTING_FLAG_KEYS.canary}.`;

export function canaryCohortFlagKey(slotId: string): string {
  return `${CANARY_COHORT_FLAG_PREFIX}${slotId}`;
}

export interface RoutingFlagInputs {
  enableObservedHealthRanking?: boolean;
  enableCanary?: boolean;
  enableShadow?: boolean;
  canaryCohorts?: Record<string, boolean>;
  flagVariants: Record<string, string>;
}

/**
 * A routing stage flag only ever narrows: an absent flag leaves the stage at its
 * configured default, so creating no flags changes no routing decision.
 */
export function routingFlagInputs(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
): RoutingFlagInputs {
  const inputs: RoutingFlagInputs = { flagVariants: {} };
  const stage = (key: string): boolean | undefined => evaluations[key]?.enabled;
  const observedHealth = stage(ROUTING_FLAG_KEYS.observedHealth);
  const canary = stage(ROUTING_FLAG_KEYS.canary);
  const shadow = stage(ROUTING_FLAG_KEYS.shadow);
  if (observedHealth !== undefined) inputs.enableObservedHealthRanking = observedHealth;
  if (canary !== undefined) inputs.enableCanary = canary;
  if (shadow !== undefined) inputs.enableShadow = shadow;
  for (const [key, evaluation] of Object.entries(evaluations)) {
    inputs.flagVariants[key] = evaluation.variant;
    if (!key.startsWith(CANARY_COHORT_FLAG_PREFIX)) continue;
    inputs.canaryCohorts ??= {};
    inputs.canaryCohorts[key.slice(CANARY_COHORT_FLAG_PREFIX.length)] = evaluation.enabled;
  }
  return inputs;
}

export function clientVisibleFlags(evaluations: Readonly<Record<string, FlagEvaluation>>): {
  enabled: Record<string, boolean>;
  variants: Record<string, string>;
} {
  const enabled: Record<string, boolean> = {};
  const variants: Record<string, string> = {};
  for (const [key, evaluation] of Object.entries(evaluations)) {
    if (key.startsWith(ROUTING_FLAG_PREFIX)) continue;
    enabled[key] = evaluation.enabled;
    variants[key] = evaluation.variant;
  }
  return { enabled, variants };
}
