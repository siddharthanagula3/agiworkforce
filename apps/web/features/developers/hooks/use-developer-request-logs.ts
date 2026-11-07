'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  DEVELOPER_REQUEST_LOGS_PATH,
  DeveloperRequestLogPageSchema,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  type DeveloperRequestLogPage,
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
import { readDeveloperApiError } from './use-developer-projects';

export interface RequestLogReadScope {
  request: RequestAuthority;
  organizationId: string | null;
}

export type RequestLogFetcher = (
  before: string | null,
  scope: RequestLogReadScope,
) => Promise<DeveloperRequestLogPage>;

async function fetchRequestLogs(before: string | null, scope: RequestLogReadScope) {
  const path = before
    ? `${DEVELOPER_REQUEST_LOGS_PATH}?before=${encodeURIComponent(before)}`
    : DEVELOPER_REQUEST_LOGS_PATH;
  const response = await scope.request.fetch(path, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      [MANAGED_CLOUD_ORGANIZATION_HEADER]:
        scope.organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    },
  });
  if (!response.ok) {
    throw new Error(await readDeveloperApiError(response, 'Request logs could not be loaded.'));
  }
  const page = DeveloperRequestLogPageSchema.parse(await response.json());
  scope.request.assertCurrent();
  return page;
}

interface LogLane {
  active: boolean;
  token: object;
  operation: RequestAuthority | null;
  page: DeveloperRequestLogPage | null;
}

interface LogView {
  lane: LogLane;
  token: object;
  page: DeveloperRequestLogPage | null;
  loadingMore: boolean;
  error: string | null;
}

export function useDeveloperRequestLogs(fetchLogs: RequestLogFetcher = fetchRequestLogs) {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const epoch = owner?.epoch;
  const data = workspace.data;
  const scopeKey = data
    ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId])
    : null;
  const organizationId = data?.activeOrganizationId ?? null;
  const lane = useMemo<LogLane>(
    () => ({ active: false, token: {}, operation: null, page: null }),
    [owner, epoch, scopeKey, fetchLogs],
  );
  const [state, setState] = useState<LogView | null>(null);
  const ownerCurrent = useCallback(
    () =>
      !!owner &&
      epoch !== undefined &&
      scopeKey !== null &&
      owner.phase === 'admitted' &&
      owner.scopeKey === scopeKey &&
      workspaceOwnerIsCurrent(owner, epoch),
    [owner, epoch, scopeKey],
  );
  const current = useCallback(() => lane.active && ownerCurrent(), [lane, ownerCurrent]);
  const publish = useCallback(
    (patch: Partial<LogView>) => {
      if (!current()) return;
      const token = {};
      lane.token = token;
      setState((previous) => ({
        lane,
        page: null,
        loadingMore: false,
        error: null,
        ...(previous?.lane === lane ? previous : {}),
        ...patch,
        token,
      }));
    },
    [current, lane],
  );

  const read = useCallback(
    async (append: boolean) => {
      if (!current() || lane.operation) return;
      const previous = lane.page;
      if (append && !previous?.nextBefore) return;
      const request = createRequestAuthority(
        owner!.session,
        () => current() && lane.operation === request,
      );
      lane.operation = request;
      publish({ loadingMore: append, error: null });
      try {
        const next = await fetchLogs(append ? previous!.nextBefore : null, {
          request,
          organizationId,
        });
        request.assertCurrent();
        const page = append ? { ...next, logs: [...previous!.logs, ...next.logs] } : next;
        lane.page = page;
        lane.operation = null;
        publish({ page, loadingMore: false });
      } catch (error) {
        if (request.isCurrent()) {
          lane.operation = null;
          publish({
            loadingMore: false,
            error: toUserMessage(error, 'Request logs could not be loaded.'),
          });
        }
      } finally {
        if (lane.operation === request) lane.operation = null;
        request.retire();
      }
    },
    [current, lane, owner, organizationId, fetchLogs, publish],
  );

  useLayoutEffect(() => {
    lane.active = true;
    const retire = () => {
      lane.active = false;
      lane.operation?.retire();
      lane.operation = null;
      lane.page = null;
    };
    const stop = subscribeWorkspaceAdmission(() => {
      if (!ownerCurrent()) {
        retire();
        setState(null);
      }
    });
    if (ownerCurrent()) void read(false);
    return () => {
      stop();
      retire();
    };
  }, [lane, ownerCurrent, read]);

  const view = state?.lane === lane && state.token === lane.token && current() ? state : null;
  return {
    viewKey: lane,
    logs: view?.page?.logs ?? null,
    nextBefore: view?.error ? null : (view?.page?.nextBefore ?? null),
    error: view?.error ?? null,
    loadingMore: view?.loadingMore ?? false,
    isUnavailable: !ownerCurrent() && !workspace.isLoading,
    requiresReload: workspace.requiresReload,
    retry: () => {
      if (!lane.active) return;
      if (!ownerCurrent()) {
        void workspace.refetch();
        return;
      }
      if (view?.token === lane.token && view.page === lane.page) void read(false);
    },
    loadMore: () => {
      if (view?.token === lane.token && view.page && view.page === lane.page && !view.error)
        void read(true);
    },
  };
}
