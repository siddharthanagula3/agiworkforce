'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { getAuthToken } from '@shared/lib/get-auth-token';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface WorkspaceServicePrincipal {
  id: string;
  name: string;
  description: string | null;
  maxScopes: string[];
  createdAt: string;
  disabledAt: string | null;
}

interface ServicePrincipalsResult {
  organizationId: string;
  canManage: boolean;
  reachableRoutes: string[];
  principals: WorkspaceServicePrincipal[];
}

export const SERVICE_PRINCIPALS_QUERY_KEY = ['workspace', 'service-principals'] as const;

const ENDPOINT = '/api/settings/organization/service-principals';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

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

function useServicePrincipals() {
  return useQuery<ServicePrincipalsResult | null, Error>({
    queryKey: SERVICE_PRINCIPALS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as ServicePrincipalsResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load workspace service principals' },
  });
}

function useSetPrincipalDisabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { principalId: string; disabled: boolean }) => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: await addCsrfHeaders({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as { principal: WorkspaceServicePrincipal };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICE_PRINCIPALS_QUERY_KEY });
    },
  });
}

export function WorkspaceServicePrincipals() {
  const { data, isPending, isError, error, refetch } = useServicePrincipals();
  const setDisabled = useSetPrincipalDisabled();
  const { confirm, dialog } = useConfirmAction();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (isPending) {
    return (
      <div role="status" style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <Spinner size="sm" />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load service principals
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load workspace service principals.')}
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

  const change = (principal: WorkspaceServicePrincipal, disabled: boolean) => {
    const run = () => {
      setPendingId(principal.id);
      return new Promise<void>((resolve) => {
        setDisabled.mutate(
          { principalId: principal.id, disabled },
          {
            onSettled: () => {
              setPendingId(null);
              resolve();
            },
          },
        );
      });
    };

    if (!disabled) return void run();

    return confirm({
      title: `Disable "${principal.name}"?`,
      description:
        'Every key issued to this principal stops working at once, and any automation using them fails on its next call. Enabling it again restores the same keys.',
      confirmLabel: 'Disable principal',
      destructive: true,
      onConfirm: run,
    });
  };

  return (
    <section style={cardStyle} aria-labelledby="workspace-service-principals-heading">
      <header className="flex items-start gap-3 px-5 py-4">
        <Bot size={16} aria-hidden style={{ color: 'var(--text-3)' }} />
        <div>
          <h3
            id="workspace-service-principals-heading"
            className="text-sm font-medium"
            style={{ color: 'var(--text-1)' }}
          >
            Service principals
          </h3>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Non-interactive workspace actors. A principal holds the permission ceiling its keys are
            bounded by, and it can reach only these endpoints:{' '}
            {data.reachableRoutes.join(', ') || 'none'}.
          </p>
        </div>
      </header>

      {data.principals.length === 0 ? (
        <p
          className="border-t px-5 py-4 text-xs"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-3)' }}
        >
          No service principals yet. One is created with the first workspace API key.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          {data.principals.map((principal) => {
            const disabled = principal.disabledAt !== null;
            return (
              <li
                key={principal.id}
                className="flex flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                style={{ borderColor: 'var(--settings-border)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                    {principal.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    {principal.maxScopes.join(', ') || 'no permissions'} · Created{' '}
                    {when(principal.createdAt)}
                    {disabled ? ` · Disabled ${when(principal.disabledAt)}` : ''}
                  </p>
                </div>
                {data.canManage ? (
                  <button
                    type="button"
                    disabled={pendingId === principal.id}
                    onClick={() => change(principal, !disabled)}
                    className={secondaryButtonClass}
                    style={{
                      borderColor: 'currentColor',
                      color: disabled ? 'var(--text-1)' : 'var(--settings-destructive-text)',
                    }}
                  >
                    {pendingId === principal.id ? 'Saving…' : disabled ? 'Enable' : 'Disable'}
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
