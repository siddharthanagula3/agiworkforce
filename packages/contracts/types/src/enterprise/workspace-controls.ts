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
  'projects',
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
  projects: 'Projects',
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

// The settings scopes below the workspace, most general first.
export const WORKSPACE_POLICY_OVERRIDE_SUBJECTS = [
  'role',
  'group',
  'project',
  'device',
  'user',
] as const;

export type WorkspacePolicyOverrideSubject = (typeof WORKSPACE_POLICY_OVERRIDE_SUBJECTS)[number];

export const WORKSPACE_POLICY_OVERRIDE_SUBJECT_LABELS: Readonly<
  Record<WorkspacePolicyOverrideSubject, string>
> = Object.freeze({
  role: 'Role',
  group: 'Directory group',
  project: 'Project',
  device: 'Device',
  user: 'Person',
});

export const WORKSPACE_POLICY_SCOPES = [
  'workspace',
  ...WORKSPACE_POLICY_OVERRIDE_SUBJECTS,
] as const;

export type WorkspacePolicyScope = (typeof WORKSPACE_POLICY_SCOPES)[number];

export interface WorkspacePolicyOverride {
  id: string;
  organizationId: string;
  subjectType: WorkspacePolicyOverrideSubject;
  subjectId: string;
  layer: WorkspaceControlsLayer;
  updatedAt: string;
}

export type WorkspacePolicyBlockingRuleControl =
  'feature' | 'reasoning_effort' | 'country' | 'surface';

// Which layer narrowed a control, so an administrator inspecting an effective
// value is told the rule that produced it and not only the value.
export interface WorkspacePolicyBlockingRule {
  control: WorkspacePolicyBlockingRuleControl;
  scope: WorkspacePolicyScope;
  overrideId: string | null;
  subjectId: string | null;
  feature?: WorkspaceFeature;
  reason: string;
}

export interface ResolvedWorkspaceControls extends WorkspaceControls {
  appliedOverrideIds: readonly string[];
}

// A resolved policy plus the rule version it came from and what narrowed it.
export interface EffectiveWorkspacePolicy extends ResolvedWorkspaceControls {
  revision: number;
  blockingRules: readonly WorkspacePolicyBlockingRule[];
}

interface LayerOrigin {
  scope: WorkspacePolicyScope;
  overrideId: string | null;
  subjectId: string | null;
}

function narrowWithLayer(
  base: WorkspaceControls,
  layer: WorkspaceControlsLayer,
  origin: LayerOrigin,
  rules: WorkspacePolicyBlockingRule[],
): WorkspaceControls {
  const featureAccess = { ...base.featureAccess };
  for (const feature of WORKSPACE_FEATURES) {
    if (layer.featureAccess?.[feature] !== false) continue;
    if (featureAccess[feature] === false) continue;
    featureAccess[feature] = false;
    rules.push({ control: 'feature', ...origin, feature, reason: 'feature_disabled' });
  }

  let maxReasoningEffort = base.maxReasoningEffort;
  const cap = layer.maxReasoningEffort;
  if (
    cap != null &&
    (maxReasoningEffort === null ||
      WORKSPACE_REASONING_EFFORTS.indexOf(cap) <
        WORKSPACE_REASONING_EFFORTS.indexOf(maxReasoningEffort))
  ) {
    maxReasoningEffort = cap;
    rules.push({ control: 'reasoning_effort', ...origin, reason: 'reasoning_effort_capped' });
  }

  let allowedCountries = base.allowedCountries;
  const layerCountries = layer.allowedCountries;
  if (layerCountries && layerCountries.length > 0) {
    const next =
      allowedCountries.length === 0
        ? [...layerCountries]
        : allowedCountries.filter((country) => layerCountries.includes(country));
    if (next.length !== allowedCountries.length) {
      allowedCountries = next;
      rules.push({ control: 'country', ...origin, reason: 'region_not_allowed' });
    }
  }

  let allowedSurfaces = base.allowedSurfaces;
  const layerSurfaces = layer.allowedSurfaces;
  if (layerSurfaces) {
    const next =
      allowedSurfaces === null
        ? [...layerSurfaces]
        : allowedSurfaces.filter((surface) => layerSurfaces.includes(surface));
    if (allowedSurfaces === null || next.length !== allowedSurfaces.length) {
      allowedSurfaces = next;
      rules.push({ control: 'surface', ...origin, reason: 'surface_not_allowed' });
    }
  }

  return {
    featureAccess,
    defaultModelId: base.defaultModelId,
    maxReasoningEffort,
    allowedCountries,
    allowedSurfaces,
  };
}

function baseAsLayer(base: WorkspaceControls): WorkspaceControlsLayer {
  return {
    featureAccess: base.featureAccess,
    maxReasoningEffort: base.maxReasoningEffort,
    allowedCountries: base.allowedCountries,
    allowedSurfaces: base.allowedSurfaces,
  };
}

// Every layer may only narrow, so the order decides which restriction is
// reported first, never whether one still applies. defaultModelId is the one
// setting that is not a restriction, so the most specific layer that sets it
// wins; resolveDefaultModelId then checks it against the model policy.
export function resolveWorkspaceControls(
  base: WorkspaceControls,
  overrides: readonly WorkspacePolicyOverride[],
  revision = 0,
): EffectiveWorkspacePolicy {
  const blockingRules: WorkspacePolicyBlockingRule[] = [];
  let resolved = narrowWithLayer(
    DEFAULT_WORKSPACE_CONTROLS,
    baseAsLayer(base),
    { scope: 'workspace', overrideId: null, subjectId: null },
    blockingRules,
  );
  let defaultModelId = base.defaultModelId;

  for (const subjectType of WORKSPACE_POLICY_OVERRIDE_SUBJECTS) {
    const tier = overrides
      .filter((override) => override.subjectType === subjectType)
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
    let tierDefaultModelId: string | null | undefined;
    for (const override of tier) {
      resolved = narrowWithLayer(
        resolved,
        override.layer,
        { scope: subjectType, overrideId: override.id, subjectId: override.subjectId },
        blockingRules,
      );
      if (tierDefaultModelId === undefined && override.layer.defaultModelId !== undefined) {
        tierDefaultModelId = override.layer.defaultModelId;
      }
    }
    if (tierDefaultModelId !== undefined) defaultModelId = tierDefaultModelId;
  }

  return {
    ...resolved,
    defaultModelId,
    appliedOverrideIds: overrides.map((override) => override.id).sort(),
    revision,
    blockingRules,
  };
}

export const WORKSPACE_POLICY_EFFECTIVE_PATH = '/api/settings/organization/policy/effective';

export const WORKSPACE_POLICY_EXPLAIN_PATH = '/api/settings/organization/policy/effective/explain';

export interface EffectiveWorkspacePolicyResponse {
  organizationId: string | null;
  governed: boolean;
  revision: number;
  controls: EffectiveWorkspacePolicy | null;
}
