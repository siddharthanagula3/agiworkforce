'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_REFLECT_PATH,
  ManagedCloudReflectRecapSchema,
  type ManagedCloudReflectRange,
  type ManagedCloudReflectRecap,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';
import { toUserMessage } from '@/lib/user-error-message';

type View = { active: boolean; request: RequestAuthority | null };
type State = { view: View; request: RequestAuthority } & (
  | { kind: 'ready'; recap: ManagedCloudReflectRecap }
  | { kind: 'memory-required' }
  | { kind: 'failed'; message: string }
);
const UNREADABLE = 'Reflect could not load right now.';

export function useReflectRecap(range: ManagedCloudReflectRange, timezone: string, active = true) {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const epoch = owner?.epoch;
  const data = workspace.data;
  const scopeKey = data
    ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId])
    : null;
  const organizationId = data?.activeOrganizationId ?? null;
  const [version, setVersion] = useState(0);
  const [, redraw] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const view = useMemo<View>(
    () => ({
      scope: { owner, epoch, scopeKey, range, timezone, active, version },
      active: false,
      request: null,
    }),
    [owner, epoch, scopeKey, range, timezone, active, version],
  );
  const rendered = useRef<View | null>(view);
  rendered.current = view;
  const current = useCallback(
    () =>
      active &&
      rendered.current === view &&
      view.active &&
      !!owner &&
      epoch !== undefined &&
      scopeKey !== null &&
      owner.phase === 'admitted' &&
      owner.scopeKey === scopeKey &&
      workspaceOwnerIsCurrent(owner, epoch),
    [active, view, owner, epoch, scopeKey],
  );

  useLayoutEffect(() => {
    view.active = true;
    const retireStale = () => {
      if (!current()) {
        view.request?.retire();
        redraw((value) => value + 1);
      }
    };
    const stopWorkspace = subscribeWorkspaceAdmission(retireStale);
    const stopSession = owner?.session.subscribe?.(retireStale);
    if (owner && current()) {
      const request = createRequestAuthority(
        owner.session,
        () => current() && view.request === request,
      );
      view.request = request;
      void (async () => {
        try {
          const query = new URLSearchParams({ range, timezone });
          const response = await request.fetch(`${MANAGED_CLOUD_REFLECT_PATH}?${query}`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              [MANAGED_CLOUD_ORGANIZATION_HEADER]:
                organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
            },
          });
          request.assertCurrent();
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
              error?: { code?: unknown; message?: unknown };
            } | null;
            request.assertCurrent();
            if (response.status === 409 && body?.error?.code === 'memory_required') {
              setState({ view, request, kind: 'memory-required' });
              return;
            }
            throw new Error(
              typeof body?.error?.message === 'string' ? body.error.message : UNREADABLE,
            );
          }
          const body: unknown = await response.json();
          request.assertCurrent();
          const recap = ManagedCloudReflectRecapSchema.parse(body);
          if (recap.range !== range) throw new Error(UNREADABLE);
          request.assertCurrent();
          setState({ view, request, kind: 'ready', recap });
        } catch (error) {
          if (request.isCurrent()) {
            setState({ view, request, kind: 'failed', message: toUserMessage(error, UNREADABLE) });
          } else if (rendered.current === view && view.active && view.request === request) {
            redraw((value) => value + 1);
          }
        }
      })();
    }
    return () => {
      view.active = false;
      view.request?.retire();
      stopWorkspace();
      stopSession?.();
    };
  }, [view, current, owner, organizationId, range, timezone]);

  const refresh = useCallback(() => {
    if (!active || rendered.current !== view || !view.active || !owner || epoch === undefined)
      return;
    if (!workspaceOwnerIsCurrent(owner, epoch)) {
      view.request?.retire();
      redraw((value) => value + 1);
      return;
    }
    if (owner.phase === 'unavailable') {
      void workspace.refetch();
      return;
    }
    if (!current()) return;
    view.request?.retire();
    rendered.current = null;
    setVersion((value) => value + 1);
  }, [active, current, view, owner, epoch, workspace]);
  const visible =
    current() && state?.view === view && state.request === view.request && state.request.isCurrent()
      ? state
      : null;
  const admitted =
    !!owner &&
    epoch !== undefined &&
    scopeKey !== null &&
    owner.phase === 'admitted' &&
    owner.scopeKey === scopeKey &&
    workspaceOwnerIsCurrent(owner, epoch);
  const unavailable = active && !workspace.isLoading && !admitted;
  return {
    recap: visible?.kind === 'ready' ? visible.recap : null,
    memoryRequired: visible?.kind === 'memory-required',
    loading: active && (workspace.isLoading || (admitted && !visible)),
    error:
      visible?.kind === 'failed'
        ? visible.message
        : unavailable
          ? workspace.requiresReload
            ? 'Reload this page to confirm your workspace before loading Reflect.'
            : 'Reflect is unavailable until your account and workspace are ready.'
          : null,
    canRefresh:
      active &&
      !!owner &&
      epoch !== undefined &&
      workspaceOwnerIsCurrent(owner, epoch) &&
      (owner.phase === 'admitted' || owner.phase === 'unavailable'),
    refresh,
  };
}
