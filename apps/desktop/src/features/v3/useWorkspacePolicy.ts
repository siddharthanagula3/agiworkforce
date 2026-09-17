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
import { CLOUD_API_BASE_URL, cloudFetch, getAuthHeaders } from '@/api/cloudApi';
import { selectHasCloudAccountSession, selectUser, useUnifiedAuthStore } from '../../stores/auth';

const CACHE_KEY_PREFIX = 'agi.desktop.workspace-policy.';

const NAV_FEATURES: Readonly<Record<string, WorkspaceFeature>> = Object.freeze({
  tasks: 'work',
  scheduled: 'schedules',
  code: 'code',
  research: 'research',
  automation: 'event_triggers',
});

const EMPTY_SNAPSHOT: WorkspacePolicySnapshot = {
  policy: null,
  source: 'none',
  stale: false,
  checkedAt: null,
};

const pollers = new Map<string, WorkspacePolicyPoller>();

function pollerFor(accountId: string): WorkspacePolicyPoller {
  let poller = pollers.get(accountId);
  if (!poller) {
    poller = createWorkspacePolicyPoller({
      request: async (headers) =>
        cloudFetch(
          `${CLOUD_API_BASE_URL}${WORKSPACE_POLICY_EFFECTIVE_PATH}`,
          { headers: { ...(await getAuthHeaders()), ...headers } },
          accountId,
        ),
      cache: localStorageWorkspacePolicyCache(`${CACHE_KEY_PREFIX}${accountId}`),
      environment: browserWorkspacePolicyEnvironment(),
    });
    pollers.set(accountId, poller);
  }
  return poller;
}

const noopSubscribe = () => () => undefined;

export function filterNavByWorkspaceFeatures<T extends { id: string }>(
  items: readonly T[],
  disabled: readonly WorkspaceFeature[],
): T[] {
  if (disabled.length === 0) return [...items];
  return items.filter((item) => {
    const feature = NAV_FEATURES[item.id];
    return !feature || !disabled.includes(feature);
  });
}

export function useDisabledWorkspaceFeatures(): readonly WorkspaceFeature[] {
  const hasCloudSession = useUnifiedAuthStore(selectHasCloudAccountSession);
  const user = useUnifiedAuthStore(selectUser);
  const accountId = hasCloudSession && user?.id ? user.id : null;
  const poller = useMemo(() => (accountId ? pollerFor(accountId) : null), [accountId]);

  useEffect(() => (poller ? poller.start() : undefined), [poller]);

  const snapshot = useSyncExternalStore(poller ? poller.subscribe : noopSubscribe, () =>
    poller ? poller.getSnapshot() : EMPTY_SNAPSHOT,
  );
  return useMemo(() => disabledWorkspaceFeatures(snapshot.policy), [snapshot.policy]);
}
