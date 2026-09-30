'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { sendAuthorizedJson } from '@/features/auth/step-up-fetch';
import { toUserMessage } from '@/lib/user-error-message';

const DATA_REGION_PATH = '/api/settings/organization/data-region';
const DATA_REGION_QUERY_KEY = ['workspace', 'data-region'] as const;

interface RegionOption {
  id: string;
  label: string;
  available: boolean;
}

interface DataRegionState {
  organizationId: string;
  region: { effective: string; requested: string | null; requestedAt: string | null };
  regions: RegionOption[];
  canMove: boolean;
}

type Lookup = { kind: 'ready'; state: DataRegionState } | { kind: 'refused'; message: string };

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

const buttonClass =
  'inline-flex min-h-8 items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    return raw.trim()
      ? toUserMessage(Object.assign(new Error(raw), { status: response.status }), fallback)
      : fallback;
  } catch {
    return fallback;
  }
}

async function send(method: string, body?: unknown): Promise<DataRegionState> {
  const response = await sendAuthorizedJson(DATA_REGION_PATH, { method, body });
  if (!response.ok) {
    throw new Error(await readError(response, 'The data region could not be changed.'));
  }
  return (await response.json()) as DataRegionState;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function WorkspaceDataRegion() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmAction();
  const [target, setTarget] = useState('');

  const lookup = useQuery({
    queryKey: DATA_REGION_QUERY_KEY,
    queryFn: async (): Promise<Lookup> => {
      const response = await sendAuthorizedJson(DATA_REGION_PATH, { method: 'GET' });
      if (response.status === 403) {
        return { kind: 'refused', message: await readError(response, 'Not available.') };
      }
      if (!response.ok) {
        throw new Error(await readError(response, 'The data region could not be loaded.'));
      }
      return { kind: 'ready', state: (await response.json()) as DataRegionState };
    },
    staleTime: 60 * 1000,
  });

  const change = useMutation<
    DataRegionState,
    Error,
    { method: 'POST' | 'DELETE'; region?: string }
  >({
    mutationFn: ({ method, region }) => send(method, region ? { region } : undefined),
    onSuccess: (state) => {
      const next: Lookup = { kind: 'ready', state };
      queryClient.setQueryData(DATA_REGION_QUERY_KEY, next);
      setTarget('');
    },
  });

  const state = lookup.data?.kind === 'ready' ? lookup.data.state : null;
  const labelOf = (id: string | null) =>
    state?.regions.find((option) => option.id === id)?.label ?? id ?? '';

  return (
    <section
      className="flex flex-col gap-4 p-5"
      style={cardStyle}
      aria-labelledby="workspace-region"
    >
      {dialog}
      <div>
        <h2
          id="workspace-region"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Data region
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Where this workspace&rsquo;s chats, files and records are stored and processed.
        </p>
      </div>

      {lookup.isLoading ? <Spinner size="sm" aria-label="Loading the data region" /> : null}
      {lookup.error ? (
        <p role="alert" className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
          {toUserMessage(lookup.error, 'The data region could not be loaded.')}
        </p>
      ) : null}
      {lookup.data?.kind === 'refused' ? (
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          {lookup.data.message}
        </p>
      ) : null}

      {state ? (
        <div className="flex flex-col gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
          <p style={{ color: 'var(--text-1)' }}>
            Stored in {labelOf(state.region.effective)}.
            {state.region.requested
              ? ` A move to ${labelOf(state.region.requested)} was requested on ${formatDate(state.region.requestedAt)}. Data stays in ${labelOf(state.region.effective)} until the copy is verified and the move completes.`
              : ''}
          </p>

          {state.region.requested ? (
            <div>
              <button
                type="button"
                className={buttonClass}
                style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                disabled={change.isPending}
                onClick={() => change.mutate({ method: 'DELETE' })}
              >
                Cancel the move
              </button>
            </div>
          ) : state.canMove ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                Move to
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  style={controlStyle}
                >
                  <option value="">Choose a region…</option>
                  {state.regions
                    .filter((option) => option.id !== state.region.effective)
                    .map((option) => (
                      <option key={option.id} value={option.id} disabled={!option.available}>
                        {option.available ? option.label : `${option.label} (not available yet)`}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className={buttonClass}
                style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                disabled={!target || change.isPending}
                onClick={() =>
                  confirm({
                    title: `Move workspace data to ${labelOf(target)}?`,
                    description: `Every chat, file and record this workspace holds is copied to ${labelOf(target)} and served from there once the copy is verified. Until then it stays in ${labelOf(state.region.effective)}. You can cancel the move before it completes.`,
                    confirmLabel: 'Request move',
                    onConfirm: () => change.mutate({ method: 'POST', region: target }),
                  })
                }
              >
                {change.isPending ? <Spinner size="sm" aria-hidden="true" /> : null}
                Request move
              </button>
            </div>
          ) : (
            <p>Choosing the data region requires an active Enterprise plan.</p>
          )}
        </div>
      ) : null}

      {change.error ? (
        <p role="alert" className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
          {toUserMessage(change.error, 'The data region could not be changed.')}
        </p>
      ) : null}
    </section>
  );
}
