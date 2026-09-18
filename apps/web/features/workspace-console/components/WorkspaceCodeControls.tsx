'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import {
  WORKSPACE_CODE_CONTROL_HINTS,
  WORKSPACE_CODE_CONTROL_LABELS,
  WORKSPACE_CODE_POLICY_PATH,
  WORKSPACE_CODE_TOGGLE_KEYS,
  type WorkspaceCodeControls as CodeControls,
  type WorkspaceCodePolicyResponse,
  type WorkspaceCodeToggleKey,
} from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export const CODE_POLICY_QUERY_KEY = ['workspace', 'code-policy'] as const;

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
  padding: '5px 8px',
} as const;

const primaryButton =
  'min-h-8 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

async function readApiError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    if (!raw.trim()) return fallback;
    return toUserMessage(Object.assign(new Error(raw), { status: res.status }), fallback);
  } catch {
    return fallback;
  }
}

export function useCodePolicy(): UseQueryResult<WorkspaceCodePolicyResponse | null, Error> {
  return useQuery<WorkspaceCodePolicyResponse | null, Error>({
    queryKey: CODE_POLICY_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(WORKSPACE_CODE_POLICY_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as WorkspaceCodePolicyResponse;
    },
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load the Code controls' },
  });
}

export function useUpdateCodePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<CodeControls>) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');

      const res = await fetch(WORKSPACE_CODE_POLICY_PATH, {
        method: 'PATCH',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as WorkspaceCodePolicyResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CODE_POLICY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });
}

function parseHosts(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].sort();
}

const TOGGLE_CONSEQUENCES: Readonly<Record<WorkspaceCodeToggleKey, string>> = {
  allowDesktopCloudSync: 'Desktop Code sessions stop syncing to the cloud for every member.',
  allowGithubConnection:
    'Members cannot connect GitHub, and sessions using a connected repository stop.',
  allowMcpServers: 'Code sessions can no longer reach any MCP server.',
  allowAutomatedReview: 'The GitHub app stops reviewing pull requests on its own.',
};

function blockedElsewhere(
  data: WorkspaceCodePolicyResponse,
  key: keyof CodeControls,
): string | null {
  const rule = data.effective.blockingRules.find(
    (entry) => entry.codeControl === key && entry.scope !== 'workspace',
  );
  return rule ? `Narrowed further for you by a ${rule.scope} exception.` : null;
}

export function WorkspaceCodeControls() {
  const policy = useCodePolicy();
  const update = useUpdateCodePolicy();
  const { confirm, dialog } = useConfirmAction();
  const saved = policy.data?.controls ?? null;

  const [draft, setDraft] = useState<CodeControls | null>(saved);
  const [mcpServers, setMcpServers] = useState('');
  const [egressHosts, setEgressHosts] = useState('');

  useEffect(() => {
    if (!saved) return;
    setDraft(saved);
    setMcpServers(saved.allowedMcpServers.join(', '));
    setEgressHosts(saved.allowedEgressHosts.join(', '));
  }, [saved]);

  if (policy.isLoading) {
    return (
      <section style={cardStyle} className="px-5 py-6">
        <Spinner aria-label="Loading the Code controls" />
      </section>
    );
  }
  if (!policy.data || !draft || !saved) return null;

  const data = policy.data;
  const canEdit = data.canManagePolicy && data.configured;
  const next: CodeControls = {
    ...draft,
    allowedMcpServers: parseHosts(mcpServers),
    allowedEgressHosts: parseHosts(egressHosts),
  };
  const dirty = JSON.stringify(next) !== JSON.stringify(saved);
  const turningOff = WORKSPACE_CODE_TOGGLE_KEYS.filter((key) => saved[key] && !next[key]);

  function save() {
    if (turningOff.length === 0) {
      update.mutate(next);
      return;
    }
    confirm({
      title: 'Turn off Code connections for the workspace',
      description: turningOff.map((key) => TOGGLE_CONSEQUENCES[key]).join(' '),
      confirmLabel: 'Turn off',
      destructive: true,
      onConfirm: () => update.mutate(next),
    });
  }

  return (
    <section style={cardStyle} aria-labelledby="workspace-code-controls-heading">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="workspace-code-controls-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Code connections
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          What a Code session may reach outside the workspace. A change applies to the next request
          a member makes, including one inside a session that is already open.
        </p>
      </div>
      <ul className="flex flex-col">
        {WORKSPACE_CODE_TOGGLE_KEYS.map((key) => {
          const narrowed = blockedElsewhere(data, key);
          return (
            <li
              key={key}
              className="flex items-start justify-between gap-4 border-b px-5 py-3"
              style={{ borderColor: 'var(--settings-border)' }}
            >
              <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-1)' }}>
                  {WORKSPACE_CODE_CONTROL_LABELS[key]}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                  {WORKSPACE_CODE_CONTROL_HINTS[key]}
                </p>
                {narrowed ? (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--text-2)' }}>
                    {narrowed}
                  </p>
                ) : null}
              </div>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Allow ${WORKSPACE_CODE_CONTROL_LABELS[key]}`}
                className="mt-1 h-4 w-4 shrink-0"
                checked={draft[key]}
                disabled={!canEdit || update.isPending}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, [key]: event.target.checked } : current,
                  )
                }
              />
            </li>
          );
        })}
      </ul>
      <div className="grid gap-3 px-5 py-4">
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
          {WORKSPACE_CODE_CONTROL_LABELS.allowedMcpServers}.{' '}
          {WORKSPACE_CODE_CONTROL_HINTS.allowedMcpServers}
          <input
            value={mcpServers}
            disabled={!canEdit || update.isPending || !draft.allowMcpServers}
            placeholder="mcp.example.com, *.tools.example.com"
            onChange={(event) => setMcpServers(event.target.value)}
            style={controlStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
          {WORKSPACE_CODE_CONTROL_LABELS.allowedEgressHosts}.{' '}
          {WORKSPACE_CODE_CONTROL_HINTS.allowedEgressHosts}
          <input
            value={egressHosts}
            disabled={!canEdit || update.isPending}
            placeholder="api.example.com"
            onChange={(event) => setEgressHosts(event.target.value)}
            style={controlStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
          {WORKSPACE_CODE_CONTROL_LABELS.sessionRetentionDays} in days.{' '}
          {WORKSPACE_CODE_CONTROL_HINTS.sessionRetentionDays}
          <input
            type="number"
            min={1}
            max={3650}
            value={draft.sessionRetentionDays ?? ''}
            disabled={!canEdit || update.isPending}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      sessionRetentionDays: event.target.value
                        ? Number.parseInt(event.target.value, 10)
                        : null,
                    }
                  : current,
              )
            }
            style={controlStyle}
          />
        </label>
      </div>
      {data.canManagePolicy && !data.configured ? (
        <p className="px-5 pb-4 text-xs" style={{ color: 'var(--text-3)' }}>
          Save the workspace policy first. Until it exists nothing here is enforced.
        </p>
      ) : null}
      {update.isError ? (
        <p
          role="alert"
          className="px-5 pb-4 text-xs"
          style={{ color: 'var(--settings-destructive-text)' }}
        >
          {toUserMessage(update.error, 'The Code controls could not be saved.')}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
          <button
            type="button"
            className={primaryButton}
            disabled={!dirty || update.isPending}
            onClick={save}
          >
            {update.isPending ? 'Saving…' : 'Save Code connections'}
          </button>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
