'use client';

import { useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { Spinner } from '@agiworkforce/ui';
import {
  WORKSPACE_CODE_CONTROL_LABELS,
  WORKSPACE_FEATURE_LABELS,
  WORKSPACE_POLICY_OVERRIDE_SUBJECT_LABELS,
  isWorkspaceFeature,
  type WorkspaceFeature,
  type WorkspacePolicyBlockingRule,
} from '@agiworkforce/types';

import { useTeamMembers } from '@/features/settings/hooks/use-settings-queries';
import {
  usePolicyDiagnosis,
  useWorkspaceGroups,
  useWorkspaceRoles,
  type PolicyDiagnosisQuery,
  type PolicyDiagnosisSurface,
} from '../hooks/use-workspace-roles';
import { GOVERNED_FEATURES } from './WorkspaceFeatureControls';

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
  padding: 'var(--space-1) var(--space-2)',
} as const;

const SURFACE_OPTIONS: ReadonlyArray<{ value: PolicyDiagnosisSurface; label: string }> = [
  { value: 'web', label: 'Web app' },
  { value: 'desktop', label: 'Desktop app' },
  { value: 'mobile', label: 'Mobile app' },
  { value: 'cli', label: 'CLI' },
  { value: 'vscode', label: 'VS Code extension' },
  { value: 'chrome', label: 'Chrome extension' },
  { value: 'api', label: 'API' },
];

function ruleSubject(rule: WorkspacePolicyBlockingRule, labels: Map<string, string>): string {
  if (rule.scope === 'workspace') return 'Workspace default';
  const label = rule.subjectId ? (labels.get(rule.subjectId) ?? rule.subjectId) : '';
  return `${WORKSPACE_POLICY_OVERRIDE_SUBJECT_LABELS[rule.scope]}${label ? `: ${label}` : ''}`;
}

function ruleControl(rule: WorkspacePolicyBlockingRule): string {
  switch (rule.control) {
    case 'feature':
      return rule.feature ? `${WORKSPACE_FEATURE_LABELS[rule.feature]} turned off` : 'Feature off';
    case 'code':
      return rule.codeControl
        ? `${WORKSPACE_CODE_CONTROL_LABELS[rule.codeControl]} restricted`
        : 'Code restricted';
    case 'reasoning_effort':
      return 'Reasoning level capped';
    case 'country':
      return 'Countries restricted';
    case 'surface':
      return 'Apps restricted';
  }
}

export function WorkspacePolicyDiagnostics({ organizationId }: { organizationId: string }) {
  const members = useTeamMembers(organizationId);
  const roles = useWorkspaceRoles();
  const groups = useWorkspaceGroups();

  const [memberId, setMemberId] = useState('');
  const [feature, setFeature] = useState<WorkspaceFeature | ''>('');
  const [surface, setSurface] = useState<PolicyDiagnosisSurface | ''>('');
  const [country, setCountry] = useState('');
  const [query, setQuery] = useState<PolicyDiagnosisQuery | null>(null);

  const diagnosis = usePolicyDiagnosis(query);

  const labels = new Map<string, string>([
    ...(members.data ?? []).map((member): [string, string] => [
      member.userId,
      member.name || member.email,
    ]),
    ...(roles.data?.roles ?? []).map((role): [string, string] => [role.id, role.name]),
    ...(groups.data?.groups ?? []).map((group): [string, string] => [group.id, group.displayName]),
  ]);

  const effective = diagnosis.data?.effective ?? null;
  const rules = effective
    ? [...effective.controls.blockingRules, ...effective.code.blockingRules]
    : [];
  const decision = diagnosis.data?.decision ?? null;

  return (
    <section
      className="flex flex-col gap-4 p-5"
      style={cardStyle}
      aria-labelledby="policy-diagnose"
    >
      <div>
        <h2
          id="policy-diagnose"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Explain a member&rsquo;s policy
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          See what one person may use after every workspace default and exception applies, which
          rule turned each thing off, and whether a request would be allowed.
        </p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!memberId) return;
          setQuery({ memberId, feature, surface, country: country.trim() });
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
            Member
            <select
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              style={controlStyle}
            >
              <option value="">Choose…</option>
              {(members.data ?? []).map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
            Feature to check (optional)
            <select
              value={feature}
              onChange={(event) =>
                setFeature(isWorkspaceFeature(event.target.value) ? event.target.value : '')
              }
              style={controlStyle}
            >
              <option value="">No request, show the policy only</option>
              {GOVERNED_FEATURES.map((value) => (
                <option key={value} value={value}>
                  {WORKSPACE_FEATURE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
            From
            <select
              value={surface}
              onChange={(event) => setSurface(event.target.value as PolicyDiagnosisSurface | '')}
              style={controlStyle}
            >
              <option value="">{feature ? 'Web app' : 'No request'}</option>
              {SURFACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-2)' }}>
            Country code (optional)
            <input
              value={country}
              maxLength={2}
              placeholder="US"
              onChange={(event) => setCountry(event.target.value.toUpperCase())}
              style={controlStyle}
            />
          </label>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          A request is checked from where it comes from. Without a country it is refused when the
          workspace allows only some countries, exactly as a real request with no known location is.
        </p>
        <div>
          <button
            type="submit"
            disabled={!memberId || diagnosis.isFetching}
            className="inline-flex min-h-8 items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {diagnosis.isFetching ? <Spinner size="sm" aria-hidden="true" /> : null}
            Explain
          </button>
        </div>
      </form>

      {diagnosis.error ? (
        <p role="alert" className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
          {toUserMessage(diagnosis.error, 'The policy could not be explained.')}
        </p>
      ) : null}

      {diagnosis.data ? (
        <div className="flex flex-col gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
          {decision ? (
            <p role="status" style={{ color: 'var(--text-1)' }}>
              <span className="font-semibold">{decision.allowed ? 'Allowed. ' : 'Refused. '}</span>
              {decision.reason}
            </p>
          ) : null}
          {effective ? (
            <>
              <p>Policy revision {effective.revision}.</p>
              {rules.length === 0 ? (
                <p>Nothing is turned off for this person.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {rules.map((rule, index) => (
                    <li
                      key={`${rule.control}:${rule.feature ?? rule.codeControl ?? ''}:${index}`}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span style={{ color: 'var(--text-1)' }}>{ruleControl(rule)}</span>
                      <span>{ruleSubject(rule, labels)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Reasoning up to {effective.controls.maxReasoningEffort ?? 'any level'} · Countries{' '}
                {effective.controls.allowedCountries.length > 0
                  ? effective.controls.allowedCountries.join(', ')
                  : 'any'}{' '}
                · Apps{' '}
                {effective.controls.allowedSurfaces
                  ? effective.controls.allowedSurfaces.join(', ')
                  : 'all'}
              </p>
            </>
          ) : (
            <p>This workspace has no policy yet, so nothing is restricted.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
