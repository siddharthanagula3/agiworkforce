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

// Code controls are the organization's answer for the Code surface specifically:
// which of its outbound connections an administrator permits at all.
export interface WorkspaceCodeControls {
  allowDesktopCloudSync: boolean;
  allowGithubConnection: boolean;
  allowMcpServers: boolean;
  allowAutomatedReview: boolean;
  allowedMcpServers: readonly string[];
  allowedEgressHosts: readonly string[];
  sessionRetentionDays: number | null;
}

export type WorkspaceCodeControlKey = keyof WorkspaceCodeControls;

export const WORKSPACE_CODE_CONTROL_KEYS = [
  'allowDesktopCloudSync',
  'allowGithubConnection',
  'allowMcpServers',
  'allowAutomatedReview',
  'allowedMcpServers',
  'allowedEgressHosts',
  'sessionRetentionDays',
] as const satisfies readonly WorkspaceCodeControlKey[];

export const WORKSPACE_CODE_TOGGLE_KEYS = [
  'allowDesktopCloudSync',
  'allowGithubConnection',
  'allowMcpServers',
  'allowAutomatedReview',
] as const;

export type WorkspaceCodeToggleKey = (typeof WORKSPACE_CODE_TOGGLE_KEYS)[number];

export const WORKSPACE_CODE_CONTROL_LABELS: Readonly<Record<WorkspaceCodeControlKey, string>> =
  Object.freeze({
    allowDesktopCloudSync: 'Desktop cloud sync',
    allowGithubConnection: 'GitHub connection',
    allowMcpServers: 'MCP servers',
    allowAutomatedReview: 'Automated pull request review',
    allowedMcpServers: 'Allowed MCP servers',
    allowedEgressHosts: 'Allowed network hosts',
    sessionRetentionDays: 'Code session retention',
  });

export const WORKSPACE_CODE_CONTROL_HINTS: Readonly<Record<WorkspaceCodeControlKey, string>> =
  Object.freeze({
    allowDesktopCloudSync: 'The desktop app syncing Code sessions to the cloud.',
    allowGithubConnection: 'Connecting a GitHub account or installing the GitHub app.',
    allowMcpServers: 'Code sessions reaching MCP servers at all.',
    allowAutomatedReview: 'The GitHub app reviewing pull requests on its own.',
    allowedMcpServers: 'Empty allows every MCP server the egress policy already permits.',
    allowedEgressHosts: 'Empty allows every host the session egress policy already permits.',
    sessionRetentionDays: 'Empty keeps Code sessions for the workspace retention period.',
  });

export const DEFAULT_WORKSPACE_CODE_CONTROLS: WorkspaceCodeControls = Object.freeze({
  allowDesktopCloudSync: true,
  allowGithubConnection: true,
  allowMcpServers: true,
  allowAutomatedReview: true,
  allowedMcpServers: Object.freeze([]) as readonly string[],
  allowedEgressHosts: Object.freeze([]) as readonly string[],
  sessionRetentionDays: null,
});

export type WorkspaceCodeControlsLayer = Partial<WorkspaceCodeControls>;

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
  code?: WorkspaceCodeControlsLayer;
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
  'feature' | 'reasoning_effort' | 'country' | 'surface' | 'code';

// Which layer narrowed a control, so an administrator inspecting an effective
// value is told the rule that produced it and not only the value.
export interface WorkspacePolicyBlockingRule {
  control: WorkspacePolicyBlockingRuleControl;
  scope: WorkspacePolicyScope;
  overrideId: string | null;
  subjectId: string | null;
  feature?: WorkspaceFeature;
  codeControl?: WorkspaceCodeControlKey;
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

export interface EffectiveWorkspaceCodeControls extends WorkspaceCodeControls {
  appliedOverrideIds: readonly string[];
  revision: number;
  blockingRules: readonly WorkspacePolicyBlockingRule[];
}

function narrowCodeWithLayer(
  base: WorkspaceCodeControls,
  layer: WorkspaceCodeControlsLayer,
  origin: LayerOrigin,
  rules: WorkspacePolicyBlockingRule[],
): WorkspaceCodeControls {
  const next: WorkspaceCodeControls = { ...base };

  for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
    if (layer[key] !== false || next[key] === false) continue;
    next[key] = false;
    rules.push({ control: 'code', ...origin, codeControl: key, reason: 'code_control_disabled' });
  }

  for (const key of ['allowedMcpServers', 'allowedEgressHosts'] as const) {
    const allowed = layer[key];
    if (!allowed || allowed.length === 0) continue;
    const current = next[key];
    const merged =
      current.length === 0 ? [...allowed] : current.filter((entry) => allowed.includes(entry));
    if (merged.length === current.length) continue;
    next[key] = merged;
    rules.push({ control: 'code', ...origin, codeControl: key, reason: 'code_control_narrowed' });
  }

  const retention = layer.sessionRetentionDays;
  if (
    retention != null &&
    (next.sessionRetentionDays === null || retention < next.sessionRetentionDays)
  ) {
    next.sessionRetentionDays = retention;
    rules.push({
      control: 'code',
      ...origin,
      codeControl: 'sessionRetentionDays',
      reason: 'code_retention_shortened',
    });
  }

  return next;
}

// Same narrow-only contract as resolveWorkspaceControls: a role, group, project,
// device or person layer may take a Code connection away and never give one back.
export function resolveWorkspaceCodeControls(
  base: WorkspaceCodeControls,
  overrides: readonly WorkspacePolicyOverride[],
  revision = 0,
): EffectiveWorkspaceCodeControls {
  const blockingRules: WorkspacePolicyBlockingRule[] = [];
  let resolved = narrowCodeWithLayer(
    DEFAULT_WORKSPACE_CODE_CONTROLS,
    base,
    { scope: 'workspace', overrideId: null, subjectId: null },
    blockingRules,
  );

  const applied: string[] = [];
  for (const subjectType of WORKSPACE_POLICY_OVERRIDE_SUBJECTS) {
    const tier = overrides
      .filter((override) => override.subjectType === subjectType)
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
    for (const override of tier) {
      if (!override.layer.code) continue;
      applied.push(override.id);
      resolved = narrowCodeWithLayer(
        resolved,
        override.layer.code,
        { scope: subjectType, overrideId: override.id, subjectId: override.subjectId },
        blockingRules,
      );
    }
  }

  return { ...resolved, appliedOverrideIds: applied.sort(), revision, blockingRules };
}

function matchesAllowedHost(pattern: string, host: string): boolean {
  const normalized = host.trim().toLowerCase();
  const rule = pattern.trim().toLowerCase();
  if (!rule || !normalized) return false;
  return rule.startsWith('*.')
    ? normalized === rule.slice(2) || normalized.endsWith(rule.slice(1))
    : normalized === rule;
}

// An empty allow list is "the organization added no rule", not "deny everything";
// the surface's own egress policy still decides. A non-empty list is exhaustive.
export function isCodeHostAllowed(
  allowed: readonly string[],
  host: string | null | undefined,
): boolean {
  if (allowed.length === 0) return true;
  if (!host) return false;
  return allowed.some((pattern) => matchesAllowedHost(pattern, host));
}

export const WORKSPACE_CODE_POLICY_PATH = '/api/settings/organization/policy/code';

export interface WorkspaceCodePolicyResponse {
  organizationId: string;
  configured: boolean;
  canManagePolicy: boolean;
  controls: WorkspaceCodeControls;
  effective: EffectiveWorkspaceCodeControls;
}

export const WORKSPACE_POLICY_EFFECTIVE_PATH = '/api/settings/organization/policy/effective';

export const WORKSPACE_POLICY_EXPLAIN_PATH = '/api/settings/organization/policy/effective/explain';

export interface EffectiveWorkspacePolicyResponse {
  organizationId: string | null;
  governed: boolean;
  revision: number;
  controls: EffectiveWorkspacePolicy | null;
}
