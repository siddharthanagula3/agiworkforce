'use client';

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { getCsrfToken } from '@/lib/client/csrf';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';

export interface SlackSettingsMutation {
  request: RequestAuthority;
  dispatched: boolean;
  start: () => boolean;
  finish: () => void;
  cancel: () => void;
}

export interface SlackSettingsView {
  id: number;
  isCurrent: () => boolean;
  reconcile: () => boolean;
  subscribe: (listener: () => void) => () => void;
  revision: () => number;
  blocked: () => boolean;
  uncertain: () => boolean;
  markUncertain: () => void;
  activate: () => void;
  retire: () => void;
  read: (current?: () => boolean) => RequestAuthority | null;
  begin: (current: () => boolean) => SlackSettingsMutation | null;
  send: (
    request: RequestAuthority,
    path: string,
    init: { method: string; body?: unknown },
  ) => Promise<Response>;
}

let nextView = 0;

export function createSlackSettingsView(
  session: SessionAuthority | null,
  current: () => boolean,
  organizationId: string | null,
): SlackSettingsView {
  let active = false;
  let revision = 0;
  let uncertain = false;
  let mutation: SlackSettingsMutation | null = null;
  const requests = new Set<RequestAuthority>();
  const listeners = new Set<() => void>();
  const publish = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };
  const isCurrent = () => active && !!session && session.isCurrent() && current();
  const retire = () => {
    active = false;
    for (const request of requests) request.retire();
    requests.clear();
    mutation = null;
    publish();
  };
  const reconcile = () => {
    if (isCurrent()) return true;
    if (active) retire();
    return false;
  };
  const read = (targetCurrent: () => boolean = () => true) => {
    if (!session || !isCurrent()) return null;
    const request = createRequestAuthority(session, () => isCurrent() && targetCurrent());
    const retire = request.retire;
    request.retire = () => {
      retire();
      requests.delete(request);
    };
    requests.add(request);
    return request;
  };
  return {
    id: ++nextView,
    isCurrent,
    reconcile,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    revision: () => revision,
    blocked: () => !isCurrent() || mutation !== null || uncertain,
    uncertain: () => uncertain,
    markUncertain: () => {
      if (isCurrent()) {
        uncertain = true;
        publish();
      }
    },
    activate: () => {
      active = true;
      publish();
    },
    retire,
    read,
    begin: (targetCurrent) => {
      if (!reconcile() || !session || mutation || uncertain || !targetCurrent()) return null;
      let started = false;
      const operation: SlackSettingsMutation = {
        request: createRequestAuthority(
          session,
          () => isCurrent() && mutation === operation && targetCurrent(),
          () => {
            operation.dispatched = true;
          },
        ),
        dispatched: false,
        start: () => {
          if (started) {
            reconcile();
            return false;
          }
          if (!reconcile() || !operation.request.isCurrent()) {
            operation.finish();
            return false;
          }
          started = true;
          return true;
        },
        cancel: () => {
          if (!started) operation.finish();
        },
        finish: () => {
          operation.request.retire();
          requests.delete(operation.request);
          if (mutation === operation) {
            mutation = null;
            publish();
          }
        },
      };
      mutation = operation;
      requests.add(operation.request);
      publish();
      return operation;
    },
    send: async (request, path, init) => {
      try {
        request.assertCurrent();
        if (!requests.has(request))
          throw new Error('The Slack request belongs to another settings view.');
        const csrf = init.method === 'GET' ? null : await getCsrfToken();
        request.assertCurrent();
        return await request.fetch(path, {
          method: init.method,
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            [MANAGED_CLOUD_ORGANIZATION_HEADER]:
              organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
            ...(csrf === null ? {} : { 'x-csrf-token': csrf }),
          },
          ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        });
      } catch (error) {
        reconcile();
        throw error;
      }
    },
  };
}

export function useSlackSettingsView(active: boolean): SlackSettingsView {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const epoch = owner?.epoch;
  const scope = workspace.data;
  const scopeKey = scope
    ? JSON.stringify([scope.scope, scope.activeWorkspaceId, scope.activeOrganizationId])
    : null;
  const [, redraw] = useState(0);
  const rendered = useRef<SlackSettingsView | null>(null);
  const phase = owner?.phase;
  const view = useMemo(() => {
    const next = createSlackSettingsView(
      owner?.session ?? null,
      () =>
        active &&
        rendered.current === next &&
        !!owner &&
        epoch !== undefined &&
        scopeKey !== null &&
        phase === 'admitted' &&
        owner.phase === phase &&
        owner.scopeKey === scopeKey &&
        workspaceOwnerIsCurrent(owner, epoch),
      scope?.activeOrganizationId ?? null,
    );
    return next;
  }, [active, owner, phase, epoch, scopeKey, scope?.activeOrganizationId]);
  rendered.current = view;
  useLayoutEffect(() => {
    view.activate();
    const retireStale = () => {
      if (!view.isCurrent()) {
        view.retire();
        redraw((value) => value + 1);
      }
    };
    const stopWorkspace = subscribeWorkspaceAdmission(retireStale);
    const stopSession = owner?.session.subscribe?.(retireStale);
    return () => {
      view.retire();
      stopWorkspace();
      stopSession?.();
    };
  }, [view, owner]);
  return view;
}

export function useSlackSettingsRevision(view: SlackSettingsView): void {
  useSyncExternalStore(view.subscribe, view.revision, view.revision);
}
