/**
 * What a feature is, once. The id is the only thing anything stores or sends;
 * the label is what a reader is shown and may change on any day without a
 * migration. The four gates are kept apart on purpose: a rollout flag says how
 * far a change has been handed out, an entitlement says what the plan carries,
 * a permission says what this principal may do, a policy says what the
 * administrator allows, and a trust boundary says where the work may run. None
 * of them can answer for another.
 *
 * `scripts/check-feature-registry.mjs` resolves every gate in its own layer's
 * vocabulary, so a policy key used as an entitlement fails.
 *
 * @module feature-registry
 */

import registryJson from './feature-registry.json' with { type: 'json' };
import type { BillingPlanCapability } from './billing-catalog';
import type { ProductDomain } from './domain-registry';
import type { AdminPermissionArea } from './enterprise/permissions';
import type { WorkspaceFeature } from './enterprise/workspace-controls';
import type { FeatureMaturity } from './model-catalog';
import type { StorageLocation } from './trust-mode-contract';

/**
 * Which question each layer answers. A feature that consults one of these and
 * calls it access control has answered a different question from the one asked.
 */
export const CONTROL_LAYERS = [
  'rolloutFlag',
  'entitlement',
  'permission',
  'policy',
  'trustBoundary',
] as const;

export type ControlLayer = (typeof CONTROL_LAYERS)[number];

export const CONTROL_LAYER_QUESTIONS: Readonly<Record<ControlLayer, string>> = Object.freeze({
  rolloutFlag: 'has this change been handed out to this request yet',
  entitlement: 'does the plan this account pays for carry it',
  permission: 'may this principal do it',
  policy: 'does the administrator allow it here',
  trustBoundary: 'may the work run where this would run it',
});

export interface FeatureGates {
  entitlement: BillingPlanCapability | null;
  policy: WorkspaceFeature | null;
  permission: AdminPermissionArea | null;
  trustBoundary: StorageLocation | null;
  rolloutFlag: string | null;
}

/**
 * What a feature that is not finished has to have said about itself before it
 * is handed to anyone: who answers for it, what would end its unfinished state,
 * how it is taken back, what happens to the rows it wrote, how it is handed out
 * and what a user who reports a problem is owed. Every one of these is a
 * question somebody asks during an incident, and prose in a document is not
 * where the answer survives.
 */
export interface FeatureGovernance {
  /** A path in this repository, so the owner cannot outlive the code. */
  owner: string;
  exitCriteria: string;
  /** The switch an operator flips to take it back, in the kill-switch vocabulary. */
  killSwitch: string;
  dataMigration: string;
  /** The rollout ring id an operator widens, never a per-surface flag key. */
  rolloutRing: string;
  support: string;
  /** Whether a user meets it, and so whether it must carry its maturity label. */
  userFacing: boolean;
}

/**
 * What a user is shown for a feature at this maturity. Generally available
 * carries no label: labelling everything is the same as labelling nothing.
 */
export const FEATURE_MATURITY_LABELS: Readonly<Record<FeatureMaturity, string | null>> =
  Object.freeze({
    experimental: 'Experimental',
    beta: 'Beta',
    general_availability: null,
    deprecated: 'Deprecated',
  });

export function featureMaturityLabel(maturity: FeatureMaturity): string | null {
  return FEATURE_MATURITY_LABELS[maturity];
}

export interface FeatureDefinition {
  label: string;
  domain: ProductDomain;
  maturity: FeatureMaturity;
  /** Present exactly when the feature is not generally available. */
  governance?: FeatureGovernance;
  dependsOn: readonly string[];
  incompatibleWith: readonly string[];
  /** The local program a surface needs before this feature can run at all. */
  requiresHost: string | null;
  /** A symbol that carries the floor, never a literal copied from it. */
  minClientVersion: string | null;
  minBackendVersion: string | null;
  gates: FeatureGates;
}

export const FEATURE_DEFINITIONS = registryJson.features as Readonly<
  Record<string, FeatureDefinition>
>;

export const FEATURE_IDS = Object.keys(FEATURE_DEFINITIONS) as readonly string[];

export type FeatureId = string;

export function isFeatureId(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEATURE_DEFINITIONS, value);
}

export function featureDefinition(id: FeatureId): FeatureDefinition | null {
  return FEATURE_DEFINITIONS[id] ?? null;
}

/** The label is for reading. Nothing resolves a feature by it. */
export function featureLabel(id: FeatureId): string {
  return FEATURE_DEFINITIONS[id]?.label ?? id;
}

export function featureGovernance(id: FeatureId): FeatureGovernance | null {
  return FEATURE_DEFINITIONS[id]?.governance ?? null;
}

/**
 * Features still carrying a maturity label, so a caller asking what is
 * unfinished reads the registry rather than a list somebody kept by hand.
 */
export function unfinishedFeatureIds(): readonly FeatureId[] {
  return FEATURE_IDS.filter((id) => FEATURE_DEFINITIONS[id]?.maturity !== 'general_availability');
}

export function featureGate(id: FeatureId, layer: ControlLayer): string | null {
  const definition = FEATURE_DEFINITIONS[id];
  return definition === undefined ? null : (definition.gates[layer] ?? null);
}

/**
 * Every feature this one needs, transitively. A cycle would make the answer
 * depend on where the walk started, so the registry guard refuses one.
 */
export function featureDependencies(id: FeatureId): readonly string[] {
  const seen = new Set<string>();
  const walk = (current: string) => {
    for (const dependency of FEATURE_DEFINITIONS[current]?.dependsOn ?? []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      walk(dependency);
    }
  };
  walk(id);
  return [...seen];
}
