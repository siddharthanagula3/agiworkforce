import type { FlagEvaluation } from './evaluate-flags';
import {
  FLAG_OFF_VARIANT,
  FLAG_ON_VARIANT,
  type FlagDefinitionInput,
  type FlagRule,
} from './flag-definition';

export const DECISION_FLAG_PREFIX = 'decision.';
export const DECISION_KILL_FLAG_KEY = 'decision.kill';

export const DECISION_SHADOW_VARIANT = 'shadow';
export const DECISION_ENABLED_VARIANT = 'enabled';

// `off` rather than `disabled`: every flag declares the variant the kill
// switch serves, and a second spelling for one state is a trap. `off` IS off.
export const DECISION_VARIANTS: readonly string[] = [
  FLAG_OFF_VARIANT,
  DECISION_SHADOW_VARIANT,
  DECISION_ENABLED_VARIANT,
];

const KIND_PATTERN = /^[a-z][a-z0-9_]*$/;

export function decisionFlagKey(kind: string): string {
  return `${DECISION_FLAG_PREFIX}${kind}`;
}

export function isDecisionFlagKey(key: string): boolean {
  if (key === DECISION_KILL_FLAG_KEY) return false;
  if (!key.startsWith(DECISION_FLAG_PREFIX)) return false;
  return KIND_PATTERN.test(key.slice(DECISION_FLAG_PREFIX.length));
}

export type DecisionFlagMode = 'disabled' | 'shadow' | 'enabled';

// Opt-in and closed: an absent flag, a store outage and an unrecognised
// variant all read disabled. `decision.kill` forces every kind off at once.
export function decisionFlagMode(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
  kind: string,
): DecisionFlagMode {
  if (evaluations[DECISION_KILL_FLAG_KEY]?.enabled === true) return 'disabled';
  const variant = evaluations[decisionFlagKey(kind)]?.variant;
  if (variant === DECISION_ENABLED_VARIANT) return 'enabled';
  if (variant === DECISION_SHADOW_VARIANT) return 'shadow';
  return 'disabled';
}

export function decisionFlagDefinition(
  kind: string,
  description: string,
  owner: string,
  rules: readonly FlagRule[] = [],
): FlagDefinitionInput {
  return {
    key: decisionFlagKey(kind),
    description,
    killSwitch: false,
    variants: [...DECISION_VARIANTS],
    defaultVariant: FLAG_OFF_VARIANT,
    rules: [...rules],
    expiresAt: null,
    maturity: 'experimental',
    owner,
  };
}

// The inverse of a capability gate: `on` means stopped, so the default is
// `off` and creating no flag stops nothing.
export function decisionKillSwitchDefinition(owner: string): FlagDefinitionInput {
  return {
    key: DECISION_KILL_FLAG_KEY,
    description: 'Forces every semantic decision kind to disabled, whatever its own flag says.',
    killSwitch: false,
    variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT],
    defaultVariant: FLAG_OFF_VARIANT,
    rules: [],
    expiresAt: null,
    maturity: 'experimental',
    owner,
  };
}
