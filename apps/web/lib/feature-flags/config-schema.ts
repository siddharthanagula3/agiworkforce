import { z } from 'zod';

import {
  ALL_KILL_SWITCH_CAPABILITIES,
  CAPABILITY_FLAG_PREFIX,
  MODEL_FLAG_PREFIX,
  PROVIDER_FLAG_PREFIX,
  TENANT_LOCKDOWN_FLAG_KEY,
  capabilityKillSwitchKey,
} from './kill-switches';
import {
  FLAG_OFF_VARIANT,
  FLAG_ON_VARIANT,
  FlagKeySchema,
  FlagVariantSchema,
  type FlagDefinitionInput,
} from './flag-definition';
import {
  DECISION_FLAG_PREFIX,
  DECISION_KILL_FLAG_KEY,
  DECISION_VARIANTS,
  isDecisionFlagKey,
} from './decision-flags';
import { ROLLOUT_FLAG_PREFIX, parseRolloutRingFlagKey } from './rollout-rings';
import { ROUTING_FLAG_KEYS, ROUTING_FLAG_PREFIX, canaryCohortFlagKey } from './routing-flags';

export const FLAG_NAMESPACE_IDS = [
  'capability',
  'decision_kill',
  'decision',
  'model',
  'provider',
  'rollout',
  'routing',
  'tenant',
] as const;

export type FlagNamespaceId = (typeof FLAG_NAMESPACE_IDS)[number];

const GATE_VARIANTS = [FLAG_ON_VARIANT, FLAG_OFF_VARIANT] as const;

// Parsed rather than trusted: a namespace naming a default variant it does not
// serve fails at module load instead of at the flag write that copies it.
export const FlagNamespaceSchema = z
  .object({
    id: z.enum(FLAG_NAMESPACE_IDS),
    prefix: z.string().min(2).max(40),
    reader: z.string().min(1).max(120),
    variants: z.array(FlagVariantSchema).min(2).max(16),
    defaultVariant: FlagVariantSchema.nullable(),
    killSwitch: z.boolean(),
    keys: z.array(FlagKeySchema).nullable(),
  })
  .strict()
  .refine(
    (entry) => entry.defaultVariant === null || entry.variants.includes(entry.defaultVariant),
    {
      message: 'A namespace default variant must be one the namespace serves',
      path: ['defaultVariant'],
    },
  )
  .refine(
    (entry) => entry.keys === null || entry.keys.every((key) => key.startsWith(entry.prefix)),
    {
      message: 'Every closed key in a namespace carries the namespace prefix',
      path: ['keys'],
    },
  );

export type FlagNamespaceShape = z.infer<typeof FlagNamespaceSchema>;

export interface FlagNamespace extends FlagNamespaceShape {
  /** Whether this namespace, as its reader spells keys, names this one. */
  readonly declares: (key: string) => boolean;
}

const ROUTING_STAGE_KEYS: readonly string[] = Object.values(ROUTING_FLAG_KEYS);
const CAPABILITY_KEYS: readonly string[] =
  ALL_KILL_SWITCH_CAPABILITIES.map(capabilityKillSwitchKey);

// `slugify` in ./kill-switches lowercases, keeps [a-z0-9_] and joins the rest
// with a hyphen, so a key it did not produce names no model or provider.
const SLUG_SUFFIX = /^[a-z0-9_]+(-[a-z0-9_]+)*$/;

function slugSuffixOf(key: string, prefix: string): boolean {
  return key.startsWith(prefix) && SLUG_SUFFIX.test(key.slice(prefix.length));
}

const NAMESPACE_SHAPES: readonly FlagNamespaceShape[] = z.array(FlagNamespaceSchema).parse([
  {
    id: 'capability',
    prefix: CAPABILITY_FLAG_PREFIX,
    reader: 'lib/feature-flags/kill-switches (capabilityKillSwitchKey)',
    variants: [...GATE_VARIANTS],
    defaultVariant: FLAG_ON_VARIANT,
    killSwitch: true,
    keys: CAPABILITY_KEYS,
  },
  // Ahead of `decision.`: flagNamespaceClaimingPrefix takes the first prefix a
  // key carries, and the kill-switch key also starts with that one.
  {
    id: 'decision_kill',
    prefix: DECISION_KILL_FLAG_KEY,
    reader: 'lib/feature-flags/decision-flags (decisionFlagMode)',
    variants: [...GATE_VARIANTS],
    defaultVariant: FLAG_OFF_VARIANT,
    killSwitch: false,
    keys: [DECISION_KILL_FLAG_KEY],
  },
  {
    id: 'decision',
    prefix: DECISION_FLAG_PREFIX,
    reader: 'lib/feature-flags/decision-flags (decisionFlagKey)',
    variants: [...DECISION_VARIANTS],
    defaultVariant: FLAG_OFF_VARIANT,
    killSwitch: false,
    keys: null,
  },
  {
    id: 'model',
    prefix: MODEL_FLAG_PREFIX,
    reader: 'lib/feature-flags/kill-switches (modelKillSwitchKey)',
    variants: [...GATE_VARIANTS],
    defaultVariant: FLAG_ON_VARIANT,
    killSwitch: true,
    keys: null,
  },
  {
    id: 'provider',
    prefix: PROVIDER_FLAG_PREFIX,
    reader: 'lib/feature-flags/kill-switches (providerKillSwitchKey)',
    variants: [...GATE_VARIANTS],
    defaultVariant: FLAG_ON_VARIANT,
    killSwitch: true,
    keys: null,
  },
  {
    id: 'rollout',
    prefix: ROLLOUT_FLAG_PREFIX,
    reader: 'lib/feature-flags/rollout-rings (rolloutRingFlagKey)',
    variants: [...GATE_VARIANTS],
    defaultVariant: FLAG_OFF_VARIANT,
    killSwitch: false,
    keys: null,
  },
  {
    id: 'routing',
    prefix: ROUTING_FLAG_PREFIX,
    reader: 'lib/feature-flags/routing-flags (routingFlagInputs)',
    variants: [...GATE_VARIANTS],
    defaultVariant: null,
    killSwitch: false,
    keys: null,
  },
  {
    id: 'tenant',
    prefix: TENANT_LOCKDOWN_FLAG_KEY,
    reader: 'lib/feature-flags/tenant-lockdown',
    variants: [...GATE_VARIANTS],
    defaultVariant: FLAG_OFF_VARIANT,
    killSwitch: true,
    keys: [TENANT_LOCKDOWN_FLAG_KEY],
  },
]);

const OPEN_KEY_TESTS: Readonly<Record<FlagNamespaceId, (key: string) => boolean>> = {
  capability: () => false,
  decision_kill: () => false,
  decision: isDecisionFlagKey,
  model: (key) => slugSuffixOf(key, MODEL_FLAG_PREFIX),
  provider: (key) => slugSuffixOf(key, PROVIDER_FLAG_PREFIX),
  rollout: (key) => parseRolloutRingFlagKey(key) !== null,
  routing: (key) =>
    ROUTING_STAGE_KEYS.includes(key) ||
    (key.startsWith(`${ROUTING_FLAG_KEYS.canary}.`) &&
      canaryCohortFlagKey(key.slice(`${ROUTING_FLAG_KEYS.canary}.`.length)) === key),
  tenant: () => false,
};

export const FLAG_NAMESPACES: readonly FlagNamespace[] = NAMESPACE_SHAPES.map((shape) => ({
  ...shape,
  declares: (key: string) => (shape.keys?.includes(key) ?? false) || OPEN_KEY_TESTS[shape.id](key),
}));

export function flagNamespaceFor(key: string): FlagNamespace | null {
  return FLAG_NAMESPACES.find((namespace) => namespace.declares(key)) ?? null;
}

export function flagNamespaceClaimingPrefix(key: string): FlagNamespace | null {
  return FLAG_NAMESPACES.find((namespace) => key.startsWith(namespace.prefix)) ?? null;
}

export function isDeclaredFlagKey(key: string): boolean {
  return flagNamespaceFor(key) !== null;
}

// A key under a reserved prefix its namespace never spells: no reader can name
// it. Keys outside every prefix are product flags read by literal name.
export function isUnreadFlagKey(key: string): boolean {
  return flagNamespaceClaimingPrefix(key) !== null && !isDeclaredFlagKey(key);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const expected = new Set(right);
  return left.length === expected.size && left.every((value) => expected.has(value));
}

// What a stored definition says that its namespace does not. Reported rather
// than corrected: rewriting one would change what a live gate serves.
export function flagConfigProblems(
  definition: Pick<FlagDefinitionInput, 'key' | 'variants' | 'defaultVariant' | 'killSwitch'>,
): string[] {
  const claimed = flagNamespaceClaimingPrefix(definition.key);
  if (!claimed) return [];
  const namespace = flagNamespaceFor(definition.key);
  if (!namespace) {
    return [`${definition.key} is not a name ${claimed.reader} spells, so no code reads it`];
  }
  const problems: string[] = [];
  if (!sameMembers(definition.variants, namespace.variants)) {
    problems.push(
      `${definition.key} serves ${definition.variants.join('/')} where ${namespace.id} flags serve ${namespace.variants.join('/')}`,
    );
  }
  if (namespace.defaultVariant !== null && definition.defaultVariant !== namespace.defaultVariant) {
    problems.push(
      `${definition.key} defaults to ${definition.defaultVariant}; ${namespace.reader} reads ${namespace.defaultVariant} as the unconfigured state`,
    );
  }
  if (definition.killSwitch && !namespace.killSwitch) {
    problems.push(
      `${definition.key} is marked a kill switch but ${namespace.id} flags are not gates`,
    );
  }
  return problems;
}
