import { ALL_PLATFORM_CAPABILITIES, type PlatformCapability } from '@agiworkforce/types';

import type { FlagEvaluation } from './evaluate-flags';
import {
  FLAG_OFF_VARIANT,
  FLAG_ON_VARIANT,
  type FlagDefinition,
  type FlagDefinitionInput,
  type FlagRule,
} from './flag-definition';

export const CAPABILITY_FLAG_PREFIX = 'capability.';
export const MODEL_FLAG_PREFIX = 'model.';
export const PROVIDER_FLAG_PREFIX = 'provider.';
export const TENANT_LOCKDOWN_FLAG_KEY = 'tenant.lockdown';

// Surfaces a release can break that no platform capability names.
export const EXTRA_KILL_SWITCH_CAPABILITIES = [
  'work',
  'dictation',
  'screen_share',
  'in_app_purchase',
  'desktop_update',
] as const;

export type ExtraKillSwitchCapability = (typeof EXTRA_KILL_SWITCH_CAPABILITIES)[number];
export type KillSwitchCapability = PlatformCapability | ExtraKillSwitchCapability;

export const COMPUTER_USE_CAPABILITY: KillSwitchCapability = 'canUseDesktopAutomation';
export const BROWSER_CAPABILITY: KillSwitchCapability = 'canUseBrowserAutomation';
export const WORK_CAPABILITY: KillSwitchCapability = 'work';
export const DICTATION_CAPABILITY: KillSwitchCapability = 'dictation';
export const SCREEN_SHARE_CAPABILITY: KillSwitchCapability = 'screen_share';
export const DESKTOP_UPDATE_CAPABILITY: KillSwitchCapability = 'desktop_update';

export function capabilityFlagSuffix(capability: KillSwitchCapability): string {
  return capability.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function capabilityKillSwitchKey(capability: KillSwitchCapability): string {
  return `${CAPABILITY_FLAG_PREFIX}${capabilityFlagSuffix(capability)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function modelKillSwitchKey(modelId: string): string {
  return `${MODEL_FLAG_PREFIX}${slugify(modelId)}`;
}

export function providerKillSwitchKey(providerId: string): string {
  return `${PROVIDER_FLAG_PREFIX}${slugify(providerId)}`;
}

export const ALL_KILL_SWITCH_CAPABILITIES: readonly KillSwitchCapability[] = [
  ...ALL_PLATFORM_CAPABILITIES,
  ...EXTRA_KILL_SWITCH_CAPABILITIES,
];

const CAPABILITY_BY_KEY: ReadonlyMap<string, KillSwitchCapability> = new Map(
  ALL_KILL_SWITCH_CAPABILITIES.map((capability) => [
    capabilityKillSwitchKey(capability),
    capability,
  ]),
);

export function capabilityForKillSwitchKey(key: string): KillSwitchCapability | null {
  return CAPABILITY_BY_KEY.get(key) ?? null;
}

const PLATFORM_CAPABILITY_SET: ReadonlySet<string> = new Set(ALL_PLATFORM_CAPABILITIES);

export function isPlatformCapability(value: KillSwitchCapability): value is PlatformCapability {
  return PLATFORM_CAPABILITY_SET.has(value);
}

/**
 * The subset the capability handshake can express. `work` and the other extra
 * switches are real surfaces with no PlatformCapability id, so they are gated
 * at their own admission point instead of by the document.
 */
export function platformCapabilitiesOf(
  capabilities: readonly KillSwitchCapability[],
): PlatformCapability[] {
  return capabilities.filter(isPlatformCapability);
}

/**
 * A kill switch is a gate: the flag says whether the thing may run, so an
 * absent flag leaves the surface exactly as it shipped. Creating no flags
 * disables nothing, and a store outage (which yields no definitions) cannot
 * take a working capability down.
 */
export function isGateOpen(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
  key: string,
): boolean {
  const evaluation = evaluations[key];
  return evaluation === undefined || evaluation.enabled;
}

export const KILL_SWITCH_PREFIXES: readonly string[] = [
  CAPABILITY_FLAG_PREFIX,
  MODEL_FLAG_PREFIX,
  PROVIDER_FLAG_PREFIX,
  TENANT_LOCKDOWN_FLAG_KEY,
];

/**
 * The definition shape every kill switch shares: two variants, open by default,
 * so that flipping `killSwitch` (or writing an `off` rule or override) is the
 * only thing that ever closes it.
 */
export function killSwitchDefinition(
  key: string,
  description: string,
  rules: readonly FlagRule[] = [],
): FlagDefinitionInput {
  return {
    key,
    description,
    killSwitch: false,
    variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT],
    defaultVariant: FLAG_ON_VARIANT,
    rules: [...rules],
    expiresAt: null,
  };
}

/**
 * A rule that closes the gate for one range of client versions on one surface,
 * which is how a broken release is stopped without waiting for a store review:
 * the affected builds read `off`, every other build is untouched.
 */
export function clientVersionKillRule(
  id: string,
  range: { min?: string; max?: string },
  surfaces?: readonly string[],
): FlagRule {
  return {
    id,
    conditions: {
      clientVersion: range,
      ...(surfaces && surfaces.length > 0 ? { surfaces: [...surfaces] } : {}),
    },
    bucketBy: 'user',
    variant: FLAG_OFF_VARIANT,
  };
}

export type KillSwitchScope = 'capability' | 'model' | 'provider' | 'tenant' | 'other';

export interface ActiveKillSwitch {
  key: string;
  scope: KillSwitchScope;
  subject: string;
  description: string;
  /** Closed for everyone, rather than for the populations a rule names. */
  global: boolean;
  versionRules: { ruleId: string; min: string | null; max: string | null }[];
  updatedAt: string;
  version: number;
}

function scopeOf(key: string): KillSwitchScope {
  if (key === TENANT_LOCKDOWN_FLAG_KEY) return 'tenant';
  if (key.startsWith(CAPABILITY_FLAG_PREFIX)) return 'capability';
  if (key.startsWith(MODEL_FLAG_PREFIX)) return 'model';
  if (key.startsWith(PROVIDER_FLAG_PREFIX)) return 'provider';
  return 'other';
}

function subjectOf(key: string, scope: KillSwitchScope): string {
  if (scope === 'capability') return key.slice(CAPABILITY_FLAG_PREFIX.length);
  if (scope === 'model') return key.slice(MODEL_FLAG_PREFIX.length);
  if (scope === 'provider') return key.slice(PROVIDER_FLAG_PREFIX.length);
  return key;
}

function closingVersionRules(definition: FlagDefinition): ActiveKillSwitch['versionRules'] {
  return definition.rules
    .filter((rule) => rule.variant === FLAG_OFF_VARIANT && rule.conditions.clientVersion)
    .map((rule) => ({
      ruleId: rule.id,
      min: rule.conditions.clientVersion?.min ?? null,
      max: rule.conditions.clientVersion?.max ?? null,
    }));
}

/**
 * Every switch that is currently holding something off, in one list, so an
 * operator does not have to remember which flags were kill switches. A flag
 * that closes only for a version range is listed too: it is off for somebody.
 */
export function activeKillSwitches(definitions: readonly FlagDefinition[]): ActiveKillSwitch[] {
  const active: ActiveKillSwitch[] = [];
  for (const definition of definitions) {
    if (definition.archivedAt !== null) continue;
    const versionRules = closingVersionRules(definition);
    const global = definition.killSwitch || definition.defaultVariant === FLAG_OFF_VARIANT;
    if (!global && versionRules.length === 0) continue;
    const scope = scopeOf(definition.key);
    active.push({
      key: definition.key,
      scope,
      subject: subjectOf(definition.key, scope),
      description: definition.description,
      global,
      versionRules,
      updatedAt: definition.updatedAt,
      version: definition.version,
    });
  }
  return active;
}
