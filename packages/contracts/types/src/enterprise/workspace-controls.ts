import type { SourceSurface } from '../suite-contracts';

export const WORKSPACE_FEATURES = [
  'work',
  'code',
  'research',
  'skills',
  'plugins',
  'hooks',
  'browser',
  'computer_use',
  'remote_control',
  'schedules',
  'event_triggers',
] as const;

export type WorkspaceFeature = (typeof WORKSPACE_FEATURES)[number];

export type WorkspaceFeatureAccess = Readonly<Record<WorkspaceFeature, boolean>>;

export const DEFAULT_WORKSPACE_FEATURE_ACCESS: WorkspaceFeatureAccess = Object.freeze(
  Object.fromEntries(WORKSPACE_FEATURES.map((feature) => [feature, true])) as Record<
    WorkspaceFeature,
    boolean
  >,
);

export const WORKSPACE_FEATURE_LABELS: Readonly<Record<WorkspaceFeature, string>> = Object.freeze({
  work: 'Work',
  code: 'Code',
  research: 'Research',
  skills: 'Skills',
  plugins: 'Plugins',
  hooks: 'Hooks',
  browser: 'Browser',
  computer_use: 'Computer use',
  remote_control: 'Remote Control',
  schedules: 'Schedules',
  event_triggers: 'Event triggers',
});

export const WORKSPACE_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type WorkspaceReasoningEffort = (typeof WORKSPACE_REASONING_EFFORTS)[number];

export function isWorkspaceFeature(value: unknown): value is WorkspaceFeature {
  return typeof value === 'string' && (WORKSPACE_FEATURES as readonly string[]).includes(value);
}

export function isWorkspaceReasoningEffort(value: unknown): value is WorkspaceReasoningEffort {
  return (
    typeof value === 'string' && (WORKSPACE_REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

export function clampReasoningEffort<T extends string>(
  effort: T | undefined,
  maximum: WorkspaceReasoningEffort | null,
): T | WorkspaceReasoningEffort | undefined {
  if (!effort || !maximum || !isWorkspaceReasoningEffort(effort)) return effort;
  return WORKSPACE_REASONING_EFFORTS.indexOf(effort) > WORKSPACE_REASONING_EFFORTS.indexOf(maximum)
    ? maximum
    : effort;
}

export interface WorkspaceControls {
  featureAccess: WorkspaceFeatureAccess;
  defaultModelId: string | null;
  maxReasoningEffort: WorkspaceReasoningEffort | null;
  allowedCountries: readonly string[];
  allowedSurfaces: readonly SourceSurface[] | null;
}

export const DEFAULT_WORKSPACE_CONTROLS: WorkspaceControls = Object.freeze({
  featureAccess: DEFAULT_WORKSPACE_FEATURE_ACCESS,
  defaultModelId: null,
  maxReasoningEffort: null,
  allowedCountries: Object.freeze([]) as readonly string[],
  allowedSurfaces: null,
});

export interface WorkspaceControlsLayer {
  featureAccess?: Partial<Record<WorkspaceFeature, boolean>>;
  defaultModelId?: string | null;
  maxReasoningEffort?: WorkspaceReasoningEffort | null;
  allowedCountries?: readonly string[];
  allowedSurfaces?: readonly SourceSurface[] | null;
}

export const WORKSPACE_POLICY_OVERRIDE_SUBJECTS = ['role', 'group', 'user'] as const;

export type WorkspacePolicyOverrideSubject = (typeof WORKSPACE_POLICY_OVERRIDE_SUBJECTS)[number];

export interface WorkspacePolicyOverride {
  id: string;
  organizationId: string;
  subjectType: WorkspacePolicyOverrideSubject;
  subjectId: string;
  layer: WorkspaceControlsLayer;
  updatedAt: string;
}

export interface ResolvedWorkspaceControls extends WorkspaceControls {
  appliedOverrideIds: readonly string[];
}

function narrowFeatureAccess(
  current: Partial<Record<WorkspaceFeature, boolean>>,
  next: Partial<Record<WorkspaceFeature, boolean>> | undefined,
): Partial<Record<WorkspaceFeature, boolean>> {
  if (!next) return current;
  const merged = { ...current };
  for (const feature of WORKSPACE_FEATURES) {
    const value = next[feature];
    if (typeof value !== 'boolean') continue;
    merged[feature] = feature in merged ? Boolean(merged[feature]) && value : value;
  }
  return merged;
}

function lowerEffort(
  left: WorkspaceReasoningEffort | null | undefined,
  right: WorkspaceReasoningEffort | null | undefined,
): WorkspaceReasoningEffort | null | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (left === null) return right;
  if (right === null) return left;
  return WORKSPACE_REASONING_EFFORTS.indexOf(left) <= WORKSPACE_REASONING_EFFORTS.indexOf(right)
    ? left
    : right;
}

function intersect<T>(left: readonly T[] | undefined, right: readonly T[] | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left.filter((value) => right.includes(value));
}

function narrowSurfaces(
  left: readonly SourceSurface[] | null | undefined,
  right: readonly SourceSurface[] | null | undefined,
): readonly SourceSurface[] | null | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (left === null) return right;
  if (right === null) return left;
  return left.filter((surface) => right.includes(surface));
}

function combineTier(overrides: readonly WorkspacePolicyOverride[]): WorkspaceControlsLayer {
  const ordered = [...overrides].sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  let featureAccess: Partial<Record<WorkspaceFeature, boolean>> = {};
  let defaultModelId: string | null | undefined;
  let maxReasoningEffort: WorkspaceReasoningEffort | null | undefined;
  let allowedCountries: readonly string[] | undefined;
  let allowedSurfaces: readonly SourceSurface[] | null | undefined;
  for (const { layer } of ordered) {
    featureAccess = narrowFeatureAccess(featureAccess, layer.featureAccess);
    if (defaultModelId === undefined && layer.defaultModelId !== undefined) {
      defaultModelId = layer.defaultModelId;
    }
    maxReasoningEffort = lowerEffort(maxReasoningEffort, layer.maxReasoningEffort);
    allowedCountries = intersect(
      allowedCountries?.length === 0 ? undefined : allowedCountries,
      layer.allowedCountries?.length === 0 ? undefined : layer.allowedCountries,
    );
    allowedSurfaces = narrowSurfaces(allowedSurfaces, layer.allowedSurfaces);
  }
  return {
    featureAccess,
    ...(defaultModelId !== undefined ? { defaultModelId } : {}),
    ...(maxReasoningEffort !== undefined ? { maxReasoningEffort } : {}),
    ...(allowedCountries !== undefined ? { allowedCountries } : {}),
    ...(allowedSurfaces !== undefined ? { allowedSurfaces } : {}),
  };
}

function applyLayer(base: WorkspaceControls, layer: WorkspaceControlsLayer): WorkspaceControls {
  const featureAccess = { ...base.featureAccess };
  for (const feature of WORKSPACE_FEATURES) {
    const value = layer.featureAccess?.[feature];
    if (typeof value === 'boolean') featureAccess[feature] = value;
  }
  return {
    featureAccess,
    defaultModelId: layer.defaultModelId !== undefined ? layer.defaultModelId : base.defaultModelId,
    maxReasoningEffort:
      layer.maxReasoningEffort !== undefined ? layer.maxReasoningEffort : base.maxReasoningEffort,
    allowedCountries:
      layer.allowedCountries !== undefined ? layer.allowedCountries : base.allowedCountries,
    allowedSurfaces:
      layer.allowedSurfaces !== undefined ? layer.allowedSurfaces : base.allowedSurfaces,
  };
}

/**
 * Workspace defaults, then role overrides, then group overrides, then user
 * exceptions. A later tier replaces what an earlier tier set; inside one tier,
 * where a member holds several roles or groups, the most restrictive value wins
 * so that adding a person to one more group can never widen what another group
 * already narrowed.
 */
export function resolveWorkspaceControls(
  base: WorkspaceControls,
  overrides: readonly WorkspacePolicyOverride[],
): ResolvedWorkspaceControls {
  let resolved = base;
  for (const subject of WORKSPACE_POLICY_OVERRIDE_SUBJECTS) {
    const tier = overrides.filter((override) => override.subjectType === subject);
    if (tier.length === 0) continue;
    resolved = applyLayer(resolved, combineTier(tier));
  }
  return {
    ...resolved,
    appliedOverrideIds: overrides.map((override) => override.id).sort(),
  };
}

export const WORKSPACE_POLICY_EFFECTIVE_PATH = '/api/settings/organization/policy/effective';

export interface EffectiveWorkspacePolicyResponse {
  organizationId: string | null;
  governed: boolean;
  revision: number;
  controls: ResolvedWorkspaceControls | null;
}
