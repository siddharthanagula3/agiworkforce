'use client';

import { useConfirmAction } from '@agiworkforce/ui';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

type Enforcement = 'off' | 'notify' | 'block';

interface SpendState {
  configured: boolean;
  monthlyCapCents: number | null;
  enforcement: Enforcement;
  alertThresholdPct: number;
  spentCents: number;
  usedPct: number | null;
  overCap: boolean;
  overThreshold: boolean;
}

interface SpendLimitResult {
  canManageLimit: boolean;
  state: SpendState;
}

const ENDPOINT = '/api/settings/organization/spend-limit';
const KEY = ['workspace', 'spend-limit'] as const;

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

async function authed(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const headers = await addCsrfHeaders({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });
  return fetch(path, { ...init, headers });
}

const ENFORCEMENT_COPY: Record<Enforcement, string> = {
  off: 'Recorded only. Nothing acts on the cap.',
  notify:
    'Crossing the cap is recorded and reported. No turn is refused, use this to watch a budget before deciding to enforce it.',
  block:
    'Managed turns are refused once the cap is reached. Enforcement is eventual rather than exact: the decision is cached briefly, so the workspace can overshoot by roughly a minute of spend.',
};

export function WorkspaceSpendLimit() {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery<SpendLimitResult | null, Error>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await authed(ENDPOINT);
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(`Failed to load the spend limit (${res.status})`);
      return (await res.json()) as SpendLimitResult;
    },
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (body: {
      monthlyCapCents: number;
      enforcement: Enforcement;
      alertThresholdPct: number;
    }) => {
      const res = await authed(ENDPOINT, { method: 'PUT', body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Could not save the spend limit (${res.status})`);
      return (await res.json()) as SpendLimitResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await authed(ENDPOINT, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Could not remove the spend limit (${res.status})`);
      return (await res.json()) as SpendLimitResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'posture'] });
    },
  });

  const [dollars, setDollars] = useState('');
  const [enforcement, setEnforcement] = useState<Enforcement>('notify');
  const [threshold, setThreshold] = useState(80);

  useEffect(() => {
    const state = data?.state;
    if (!state?.configured || state.monthlyCapCents === null) return;
    setDollars((state.monthlyCapCents / 100).toFixed(2));
    setEnforcement(state.enforcement);
    setThreshold(state.alertThresholdPct);
  }, [data]);

  if (isPending || isError || data === null || data === undefined) return null;

  const { state, canManageLimit } = data;
  const cents = Math.round(Number.parseFloat(dollars || '0') * 100);
  const canSave = canManageLimit && Number.isFinite(cents) && cents >= 1 && !save.isPending;

  return (
    <section style={cardStyle} aria-labelledby="spend-limit-heading">
      {confirmDialog}
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="spend-limit-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Monthly spend limit
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          A calendar-month ceiling, matched to the invoice period rather than a rolling window so it
          ties to something finance can reconcile.
        </p>
      </div>

      {state.configured && state.monthlyCapCents !== null ? (
        <div className="px-5 pt-4">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--bg-hover)' }}
            role="img"
            aria-label={`${state.usedPct ?? 0}% of the monthly limit used`}
          >
            <div
              style={{
                width: `${Math.min(100, state.usedPct ?? 0)}%`,
                height: '100%',
                background: state.overCap ? 'var(--settings-destructive)' : 'var(--text-3)',
              }}
            />
          </div>
          <p className="mt-2 text-xs tabular-nums" style={{ color: 'var(--text-2)' }}>
            ${(state.spentCents / 100).toFixed(2)} of ${(state.monthlyCapCents / 100).toFixed(2)}{' '}
            used this month
            {state.overCap
              ? ' · over the limit'
              : state.overThreshold
                ? ` · past the ${state.alertThresholdPct}% alert`
                : ''}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--text-3)' }} htmlFor="spend-cap">
            Cap (USD)
          </label>
          <input
            id="spend-cap"
            type="number"
            min={0.01}
            step={0.01}
            value={dollars}
            disabled={!canManageLimit}
            onChange={(event) => setDollars(event.target.value)}
            style={{ ...controlStyle, width: 120 }}
          />
          <label className="text-xs" style={{ color: 'var(--text-3)' }} htmlFor="spend-alert">
            Alert at
          </label>
          <input
            id="spend-alert"
            type="number"
            min={1}
            max={100}
            value={threshold}
            disabled={!canManageLimit}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(next)) setThreshold(next);
            }}
            style={{ ...controlStyle, width: 72 }}
          />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            %
          </span>
          <select
            value={enforcement}
            disabled={!canManageLimit}
            aria-label="Spend limit enforcement"
            onChange={(event) => setEnforcement(event.target.value as Enforcement)}
            style={controlStyle}
          >
            <option value="off">Off</option>
            <option value="notify">Notify</option>
            <option value="block">Block</option>
          </select>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {ENFORCEMENT_COPY[enforcement]}
        </p>

        {enforcement === 'block' && state.enforcement !== 'block' ? (
          <div
            role="status"
            className="rounded-md border px-3 py-2 text-xs leading-relaxed"
            style={{ borderColor: 'currentColor', color: 'var(--settings-destructive-text)' }}
          >
            Saving this starts refusing members&rsquo; managed turns once the cap is reached. Work
            already running is unaffected; new turns are declined until the cap is raised or the
            month rolls over.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                monthlyCapCents: cents,
                enforcement,
                alertThresholdPct: threshold,
              })
            }
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : state.configured ? 'Update limit' : 'Set limit'}
          </button>
          {state.configured ? (
            <button
              type="button"
              disabled={!canManageLimit || remove.isPending}
              onClick={() =>
                confirm({
                  title: 'Remove the workspace spend limit?',
                  description:
                    'Spending is no longer capped. Members can run turns without the limit refusing them, and the workspace can exceed the budget you set.',
                  confirmLabel: 'Remove limit',
                  onConfirm: () => remove.mutate(),
                })
              }
              className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            >
              {remove.isPending ? 'Removing…' : 'Remove limit'}
            </button>
          ) : null}
          {save.isError || remove.isError ? (
            <span className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
              {(save.error ?? remove.error)?.message}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
