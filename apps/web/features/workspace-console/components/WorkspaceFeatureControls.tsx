'use client';

import { useEffect, useState } from 'react';
import { useConfirmAction } from '@agiworkforce/ui';
import {
  WORKSPACE_FEATURE_LABELS,
  WORKSPACE_POLICY_OVERRIDE_SUBJECT_LABELS,
  WORKSPACE_REASONING_EFFORTS,
  type WorkspaceControls,
  type WorkspaceControlsLayer,
  type WorkspaceFeature,
  type WorkspacePolicyOverride,
  type WorkspacePolicyOverrideSubject,
  type WorkspaceReasoningEffort,
} from '@agiworkforce/types';

import {
  useUpdateWorkspacePolicy,
  useWorkspacePolicy,
  useTeamMembers,
} from '@/features/settings/hooks/use-settings-queries';
import { useModelPolicy } from '../hooks/use-model-policy';
import {
  useDeletePolicyOverride,
  usePolicyOverrides,
  useUpsertPolicyOverride,
  useWorkspaceGroups,
  useWorkspaceRoles,
} from '../hooks/use-workspace-roles';

export const GOVERNED_FEATURES: readonly WorkspaceFeature[] = [
  'work',
  'code',
  'research',
  'projects',
  'skills',
  'plugins',
  'hooks',
  'browser',
  'computer_use',
  'remote_control',
  'schedules',
  'event_triggers',
];

const FEATURE_HINTS: Readonly<Partial<Record<WorkspaceFeature, string>>> = {
  work: 'Multi-step Work runs in chat.',
  code: 'Cloud Code sessions, their agent, commands and notebooks.',
  research: 'Research mode in chat.',
  projects: 'Creating projects, and the knowledge and instructions they carry.',
  skills: 'Choosing, offering, creating and installing skills.',
  plugins: 'Installing plugins, and plugin skills in chat.',
  hooks: 'Plugin and settings hooks running on the desktop app and the CLI.',
  browser: 'The Chrome extension acting on web pages.',
  computer_use: 'The desktop app controlling the screen, mouse and keyboard.',
  remote_control: 'Pairing a phone to a desktop, and driving a session from it.',
  schedules: 'Creating schedules, and scheduled runs.',
  event_triggers: 'Triggers that start a task when a connected account fires an event.',
};

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const controlStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '4px 8px',
} as const;

const primaryButton =
  'min-h-8 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const secondaryButton =
  'min-h-8 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

function parseCountries(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code)),
    ),
  ].sort();
}

export function describeLayer(layer: WorkspaceControlsLayer): string {
  const parts: string[] = [];
  for (const feature of GOVERNED_FEATURES) {
    const value = layer.featureAccess?.[feature];
    if (typeof value === 'boolean') {
      parts.push(`${WORKSPACE_FEATURE_LABELS[feature]} ${value ? 'on' : 'off'}`);
    }
  }
  if (layer.maxReasoningEffort !== undefined) {
    parts.push(
      layer.maxReasoningEffort
        ? `reasoning up to ${layer.maxReasoningEffort}`
        : 'no reasoning limit',
    );
  }
  if (layer.allowedCountries?.length) parts.push(`only from ${layer.allowedCountries.join(', ')}`);
  return parts.join(' · ') || 'No changes';
}

function WorkspaceDefaults({
  controls,
  canEdit: canManage,
  configured,
}: {
  controls: WorkspaceControls;
  canEdit: boolean;
  configured: boolean;
}) {
  const canEdit = canManage && configured;
  const update = useUpdateWorkspacePolicy();
  const models = useModelPolicy();
  const [draft, setDraft] = useState(controls);
  const [countries, setCountries] = useState(controls.allowedCountries.join(', '));

  useEffect(() => {
    setDraft(controls);
    setCountries(controls.allowedCountries.join(', '));
  }, [controls]);

  const next: WorkspaceControls = { ...draft, allowedCountries: parseCountries(countries) };
  const dirty = JSON.stringify(next) !== JSON.stringify(controls);
  const liveModels = (models.data?.catalog.models ?? []).filter((model) => model.live);

  return (
    <section style={cardStyle} aria-labelledby="workspace-feature-controls-heading">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="workspace-feature-controls-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Features and defaults
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          A feature switched off is refused by the server on every surface, for every member without
          an exception below. Members already using it are stopped on their next request.
        </p>
      </div>
      <ul className="flex flex-col">
        {GOVERNED_FEATURES.map((feature) => (
          <li
            key={feature}
            className="flex items-start justify-between gap-4 border-b px-5 py-3"
            style={{ borderColor: 'var(--settings-border)' }}
          >
            <div className="min-w-0">
              <p className="text-sm" style={{ color: 'var(--text-1)' }}>
                {WORKSPACE_FEATURE_LABELS[feature]}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                {FEATURE_HINTS[feature]}
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label={`Allow ${WORKSPACE_FEATURE_LABELS[feature]}`}
              className="mt-1 h-4 w-4 shrink-0"
              checked={draft.featureAccess[feature]}
              disabled={!canEdit || update.isPending}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  featureAccess: { ...current.featureAccess, [feature]: event.target.checked },
                }))
              }
            />
          </li>
        ))}
      </ul>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
          Default model, used when a member leaves the model on Auto
          <select
            value={draft.defaultModelId ?? ''}
            disabled={!canEdit || update.isPending}
            onChange={(event) =>
              setDraft((current) => ({ ...current, defaultModelId: event.target.value || null }))
            }
            style={controlStyle}
          >
            <option value="">Auto</option>
            {liveModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
          Highest reasoning level
          <select
            value={draft.maxReasoningEffort ?? ''}
            disabled={!canEdit || update.isPending}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maxReasoningEffort: (event.target.value || null) as WorkspaceReasoningEffort | null,
              }))
            }
            style={controlStyle}
          >
            <option value="">No limit</option>
            {WORKSPACE_REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex flex-col gap-1 text-xs sm:col-span-2"
          style={{ color: 'var(--text-3)' }}
        >
          Allowed countries, as two-letter codes. Empty allows every country; a request whose
          country cannot be determined is refused once any are listed.
          <input
            value={countries}
            disabled={!canEdit || update.isPending}
            placeholder="US, DE"
            onChange={(event) => setCountries(event.target.value)}
            style={controlStyle}
          />
        </label>
      </div>
      {canManage && !configured ? (
        <p className="px-5 pb-4 text-xs" style={{ color: 'var(--text-3)' }}>
          Save the workspace policy above first. Until it exists nothing here is enforced, and a
          first save from this card would also apply that policy&rsquo;s restrictive defaults.
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
          <button
            type="button"
            className={primaryButton}
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate({ controls: next })}
          >
            {update.isPending ? 'Saving…' : 'Save features and defaults'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type TriState = 'inherit' | 'on' | 'off';

function PolicyExceptions({ organizationId }: { organizationId: string }) {
  const overrides = usePolicyOverrides(true);
  const roles = useWorkspaceRoles();
  const groups = useWorkspaceGroups();
  const members = useTeamMembers(organizationId);
  const upsert = useUpsertPolicyOverride();
  const remove = useDeletePolicyOverride();
  const { confirm, dialog } = useConfirmAction();

  const [subjectType, setSubjectType] = useState<WorkspacePolicyOverrideSubject>('user');
  const [subjectId, setSubjectId] = useState('');
  const [features, setFeatures] = useState<Partial<Record<WorkspaceFeature, TriState>>>({});
  const [effort, setEffort] = useState<string>('inherit');

  const subjects: { id: string; label: string }[] =
    subjectType === 'user'
      ? (members.data ?? []).map((member) => ({
          id: member.userId,
          label: member.name || member.email,
        }))
      : subjectType === 'group'
        ? (groups.data?.groups ?? []).map((group) => ({ id: group.id, label: group.displayName }))
        : (roles.data?.roles ?? [])
            .filter((role) => role.key !== 'primary_owner')
            .map((role) => ({ id: role.id, label: role.name }));

  function subjectLabel(override: WorkspacePolicyOverride): string {
    const pool =
      override.subjectType === 'user'
        ? (members.data ?? []).map((m) => ({ id: m.userId, label: m.name || m.email }))
        : override.subjectType === 'group'
          ? (groups.data?.groups ?? []).map((g) => ({ id: g.id, label: g.displayName }))
          : override.subjectType === 'role'
            ? (roles.data?.roles ?? []).map((r) => ({ id: r.id, label: r.name }))
            : [];
    const label =
      pool.find((entry) => entry.id === override.subjectId)?.label ?? override.subjectId;
    return `${WORKSPACE_POLICY_OVERRIDE_SUBJECT_LABELS[override.subjectType]}: ${label}`;
  }

  const layer: WorkspaceControlsLayer = {
    featureAccess: Object.fromEntries(
      Object.entries(features)
        .filter(([, value]) => value !== 'inherit')
        .map(([feature, value]) => [feature, value === 'on']),
    ),
    ...(effort === 'inherit'
      ? {}
      : {
          maxReasoningEffort: (effort === 'none-limit'
            ? null
            : effort) as WorkspaceReasoningEffort | null,
        }),
  };
  const hasChanges = Object.keys(layer.featureAccess ?? {}).length > 0 || effort !== 'inherit';

  return (
    <section style={cardStyle} aria-labelledby="workspace-policy-exceptions-heading">
      {dialog}
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="workspace-policy-exceptions-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Exceptions
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Role exceptions apply over the workspace defaults, group exceptions over roles, and a
          person&rsquo;s exception over both. When someone holds two roles or is in two groups, the
          stricter setting wins.
        </p>
      </div>
      <ul className="flex flex-col">
        {(overrides.data?.overrides ?? []).map((override) => (
          <li
            key={override.id}
            className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3"
            style={{ borderColor: 'var(--settings-border)' }}
          >
            <div className="min-w-0">
              <p className="text-sm" style={{ color: 'var(--text-1)' }}>
                {subjectLabel(override)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                {describeLayer(override.layer)}
              </p>
            </div>
            <button
              type="button"
              className={secondaryButton}
              disabled={remove.isPending}
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
              onClick={() =>
                confirm({
                  title: 'Remove this exception?',
                  description: `${subjectLabel(override)} goes back to the workspace defaults on their next request. Anything this exception switched on for them stops working.`,
                  confirmLabel: 'Remove exception',
                  onConfirm: () => remove.mutate(override.id),
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Exception applies to"
            value={subjectType}
            onChange={(event) => {
              setSubjectType(event.target.value as WorkspacePolicyOverrideSubject);
              setSubjectId('');
            }}
            style={controlStyle}
          >
            <option value="user">A person</option>
            <option value="group">A directory group</option>
            <option value="role">A role</option>
          </select>
          <select
            aria-label="Who the exception applies to"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            style={{ ...controlStyle, minWidth: 0, flex: 1 }}
          >
            <option value="">Choose…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {GOVERNED_FEATURES.map((feature) => (
            <label
              key={feature}
              className="flex items-center justify-between gap-2 text-xs"
              style={{ color: 'var(--text-2)' }}
            >
              {WORKSPACE_FEATURE_LABELS[feature]}
              <select
                value={features[feature] ?? 'inherit'}
                onChange={(event) =>
                  setFeatures((current) => ({
                    ...current,
                    [feature]: event.target.value as TriState,
                  }))
                }
                style={controlStyle}
              >
                <option value="inherit">Workspace default</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
          ))}
          <label
            className="flex items-center justify-between gap-2 text-xs"
            style={{ color: 'var(--text-2)' }}
          >
            Highest reasoning level
            <select
              value={effort}
              onChange={(event) => setEffort(event.target.value)}
              style={controlStyle}
            >
              <option value="inherit">Workspace default</option>
              <option value="none-limit">No limit</option>
              {WORKSPACE_REASONING_EFFORTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={!subjectId || !hasChanges || upsert.isPending}
            onClick={() =>
              upsert.mutate(
                { subjectType, subjectId, layer },
                {
                  onSuccess: () => {
                    setFeatures({});
                    setEffort('inherit');
                  },
                },
              )
            }
          >
            {upsert.isPending ? 'Saving…' : 'Save exception'}
          </button>
          {upsert.error || remove.error ? (
            <p
              role="alert"
              className="text-xs"
              style={{ color: 'var(--settings-destructive-text)' }}
            >
              {(upsert.error ?? remove.error)?.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function WorkspaceFeatureControls() {
  const policy = useWorkspacePolicy();
  const overview = policy.data ?? null;
  if (!overview) return null;

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceDefaults
        controls={overview.policy.controls}
        canEdit={overview.canManagePolicy}
        configured={overview.configured}
      />
      {overview.canManagePolicy && overview.configured ? (
        <PolicyExceptions organizationId={overview.organizationId} />
      ) : null}
    </div>
  );
}
