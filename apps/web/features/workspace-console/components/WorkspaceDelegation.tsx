'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { getAuthToken } from '@shared/lib/get-auth-token';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface WorkspaceDelegationEntry {
  id: string;
  organizationId: string;
  delegateUserId: string;
  grantedByUserId: string;
  scopes: string[];
  reason: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface DelegationResult {
  organizationId: string;
  canManage: boolean;
  delegatablePermissions: string[];
  maxDurationMs: number;
  yourScopes: string[];
  delegations: WorkspaceDelegationEntry[];
}

interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  isCurrentUser: boolean;
}

export const DELEGATION_QUERY_KEY = ['workspace', 'admin-delegations'] as const;

const ENDPOINT = '/api/settings/organization/delegation';
const DAY_MS = 24 * 60 * 60_000;
const DURATION_CHOICES = [7, 30, 90] as const;

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

const fieldClass =
  'w-full rounded-md border px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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

function when(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function delegationState(
  entry: WorkspaceDelegationEntry,
  now = Date.now(),
): 'revoked' | 'expired' | 'live' {
  if (entry.revokedAt) return 'revoked';
  return new Date(entry.expiresAt).getTime() <= now ? 'expired' : 'live';
}

async function authorizedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const method = init?.method ?? 'GET';
  const headers =
    method === 'GET'
      ? { Authorization: `Bearer ${token}` }
      : await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        });
  return fetch(input, { ...init, headers });
}

function useDelegations() {
  return useQuery<DelegationResult | null, Error>({
    queryKey: DELEGATION_QUERY_KEY,
    queryFn: async () => {
      const res = await authorizedFetch(ENDPOINT);
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as DelegationResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load admin delegations' },
  });
}

function useTeamMembers(enabled: boolean) {
  return useQuery<TeamMember[], Error>({
    queryKey: ['workspace', 'delegation', 'members'],
    enabled,
    queryFn: async () => {
      const res = await authorizedFetch('/api/settings/team');
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as { members?: TeamMember[] };
      return body.members ?? [];
    },
    staleTime: 60 * 1000,
    meta: { errorMessage: 'Failed to load workspace members' },
  });
}

function useDelegationMutation(method: 'POST' | 'DELETE') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await authorizedFetch(ENDPOINT, { method, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as { delegation: WorkspaceDelegationEntry };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DELEGATION_QUERY_KEY });
    },
  });
}

export function WorkspaceDelegation() {
  const { data, isPending, isError, error, refetch } = useDelegations();
  const members = useTeamMembers(data?.canManage === true);
  const grant = useDelegationMutation('POST');
  const revoke = useDelegationMutation('DELETE');
  const { confirm, dialog } = useConfirmAction();

  const [delegateUserId, setDelegateUserId] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [days, setDays] = useState<number>(30);
  const [formError, setFormError] = useState<string | null>(null);

  if (isPending) {
    return (
      <div role="status" style={{ ...cardStyle, padding: 20 }}>
        <Spinner size="sm" />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load admin delegations
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load admin delegations.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={`${secondaryButtonClass} mt-3`}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) return null;

  const maxDays = Math.floor(data.maxDurationMs / DAY_MS);
  const candidates = (members.data ?? []).filter((member) => !member.isCurrentUser);

  const toggleScope = (scope: string) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    );
  };

  const submitGrant = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!delegateUserId || scopes.length === 0) {
      setFormError('Choose a member and at least one permission.');
      return;
    }
    grant.mutate(
      {
        delegateUserId,
        scopes,
        expiresAt: new Date(Date.now() + days * DAY_MS).toISOString(),
      },
      {
        onSuccess: () => {
          setDelegateUserId('');
          setScopes([]);
        },
        onError: (mutationError: Error) =>
          setFormError(toUserMessage(mutationError, 'Could not grant this delegation. Try again.')),
      },
    );
  };

  const askToRevoke = (entry: WorkspaceDelegationEntry) =>
    confirm({
      title: 'Revoke this delegation?',
      description: `${entry.delegateUserId} loses ${entry.scopes.join(', ')} immediately, and anything they started under it stops. Revoking cannot be undone: you would have to grant a new delegation.`,
      confirmLabel: 'Revoke delegation',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          revoke.mutate({ delegationId: entry.id }, { onSettled: () => resolve() });
        }),
    });

  return (
    <section style={cardStyle} aria-labelledby="workspace-delegation-heading">
      <header className="flex items-start gap-3 px-5 py-4">
        <ShieldCheck size={16} aria-hidden style={{ color: 'var(--text-3)' }} />
        <div>
          <h3
            id="workspace-delegation-heading"
            className="text-sm font-medium"
            style={{ color: 'var(--text-1)' }}
          >
            Admin delegation
          </h3>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Hand a member named admin permissions for a fixed period. A delegation lasts at most{' '}
            {maxDays} days, never carries an owner-only permission, and never lets its holder
            remove, demote or transfer an owner.
          </p>
        </div>
      </header>

      {data.canManage ? (
        <form
          className="border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
          onSubmit={submitGrant}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs" style={{ color: 'var(--text-3)' }}>
              Member
              <select
                className={`${fieldClass} mt-1`}
                style={{
                  borderColor: 'var(--settings-border)',
                  background: 'var(--bg-elev)',
                  color: 'var(--text-1)',
                }}
                value={delegateUserId}
                onChange={(event) => setDelegateUserId(event.target.value)}
              >
                <option value="">Choose a member</option>
                {candidates.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs sm:w-40" style={{ color: 'var(--text-3)' }}>
              Expires in
              <select
                className={`${fieldClass} mt-1`}
                style={{
                  borderColor: 'var(--settings-border)',
                  background: 'var(--bg-elev)',
                  color: 'var(--text-1)',
                }}
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {DURATION_CHOICES.filter((choice) => choice <= maxDays).map((choice) => (
                  <option key={choice} value={choice}>
                    {choice} days
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="mt-3">
            <legend className="text-xs" style={{ color: 'var(--text-3)' }}>
              Permissions
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {data.delegatablePermissions.map((permission) => (
                <label
                  key={permission}
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--text-1)' }}
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(permission)}
                    onChange={() => toggleScope(permission)}
                  />
                  {permission}
                </label>
              ))}
            </div>
          </fieldset>

          {formError ? (
            <p
              role="alert"
              className="mt-2 text-xs"
              style={{ color: 'var(--settings-destructive-text)' }}
            >
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={grant.isPending}
            className={`${secondaryButtonClass} mt-3`}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          >
            {grant.isPending ? <Spinner size="sm" /> : null}
            {grant.isPending ? 'Granting' : 'Grant delegation'}
          </button>
        </form>
      ) : null}

      {data.delegations.length === 0 ? (
        <p
          className="border-t px-5 py-4 text-xs"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-3)' }}
        >
          No delegation has been granted in this workspace.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          {data.delegations.map((entry) => {
            const state = delegationState(entry);
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                style={{ borderColor: 'var(--settings-border)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                    {entry.delegateUserId}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    {entry.scopes.join(', ')} · Granted by {entry.grantedByUserId} ·{' '}
                    {state === 'revoked'
                      ? `Revoked ${when(entry.revokedAt)}`
                      : state === 'expired'
                        ? `Expired ${when(entry.expiresAt)}`
                        : `Expires ${when(entry.expiresAt)}`}
                  </p>
                </div>
                {data.canManage && state === 'live' ? (
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() => void askToRevoke(entry)}
                    className={secondaryButtonClass}
                    style={{
                      borderColor: 'currentColor',
                      color: 'var(--settings-destructive-text)',
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </section>
  );
}
