'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  browserWorkspacePolicyEnvironment,
  createWorkspacePolicyPoller,
  disabledWorkspaceFeatures,
  localStorageWorkspacePolicyCache,
  type WorkspacePolicyPoller,
  type WorkspacePolicySnapshot,
} from '@agiworkforce/client-runtime';
import { WORKSPACE_POLICY_EFFECTIVE_PATH, type WorkspaceFeature } from '@agiworkforce/types';
import { useCurrentUser } from '@/lib/identity/client';
import { getAuthToken } from '@shared/lib/get-auth-token';

const CACHE_KEY_PREFIX = 'agi.workspace-policy.';
const EMPTY_SNAPSHOT: WorkspacePolicySnapshot = {
  policy: null,
  source: 'none',
  stale: false,
  checkedAt: null,
};

interface PollerEntry {
  poller: WorkspacePolicyPoller;
  users: number;
  stop: (() => void) | null;
}

const pollers = new Map<string, PollerEntry>();

async function requestEffectivePolicy(headers: Record<string, string>): Promise<Response> {
  const token = await getAuthToken();
  if (!token) return new Response(null, { status: 401 });
  return fetch(WORKSPACE_POLICY_EFFECTIVE_PATH, {
    credentials: 'include',
    cache: 'no-store',
    headers: { ...headers, Authorization: `Bearer ${token}` },
  });
}

function pollerFor(userId: string): PollerEntry {
  let entry = pollers.get(userId);
  if (!entry) {
    entry = {
      poller: createWorkspacePolicyPoller({
        request: requestEffectivePolicy,
        cache: localStorageWorkspacePolicyCache(`${CACHE_KEY_PREFIX}${userId}`),
        environment: browserWorkspacePolicyEnvironment(),
      }),
      users: 0,
      stop: null,
    };
    pollers.set(userId, entry);
  }
  return entry;
}

export function __resetWorkspacePolicyPollersForTest(): void {
  for (const entry of pollers.values()) entry.stop?.();
  pollers.clear();
}

const noopSubscribe = () => () => undefined;

export function useWorkspacePolicy(): WorkspacePolicySnapshot {
  const { user, isLoaded } = useCurrentUser();
  const userId = isLoaded && user ? user.id : null;
  const entry = useMemo(() => (userId ? pollerFor(userId) : null), [userId]);

  useEffect(() => {
    if (!entry) return;
    entry.users += 1;
    if (!entry.stop) entry.stop = entry.poller.start();
    return () => {
      entry.users -= 1;
      if (entry.users === 0) {
        entry.stop?.();
        entry.stop = null;
      }
    };
  }, [entry]);

  return useSyncExternalStore(
    entry ? entry.poller.subscribe : noopSubscribe,
    () => (entry ? entry.poller.getSnapshot() : EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  );
}

export function useDisabledWorkspaceFeatures(): readonly WorkspaceFeature[] {
  const { policy } = useWorkspacePolicy();
  return useMemo(() => disabledWorkspaceFeatures(policy), [policy]);
}
