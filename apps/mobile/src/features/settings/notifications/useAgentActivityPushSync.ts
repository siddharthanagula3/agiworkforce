import { useEffect, useRef, useState } from 'react';

import { fetchPreferenceNamespace, patchPreferenceNamespace } from '@/services/preferences';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

export const ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE = 'notifications';

/**
 * Read by `apps/web/lib/services/agent-notification-service.ts` before it hands
 * an agent-run notice to Expo. It is opt-out: only an explicit `false` silences
 * agent-run push, and this screen is the only surface that writes it.
 */
export const AGENT_ACTIVITY_PUSH_PREFERENCE_KEY = 'mobilePushAgentActivity';

export type AgentActivityPushStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

interface AgentActivityPushSync {
  enabled: boolean;
  ready: boolean;
  canRetry: boolean;
  status: AgentActivityPushStatus;
  error: string | null;
  setEnabled: (value: boolean) => void;
  retry: () => void;
}

interface AgentActivityPushOwner {
  account: CloudAccountEpoch | null;
  local: boolean;
  controller: AbortController;
  enabled: boolean;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  failed: boolean;
  revision: number;
}

function ownerIsCurrent(owner: AgentActivityPushOwner): boolean {
  if (owner.controller.signal.aborted) return false;
  const mode = useChatAppModeStore.getState().appMode;
  if (owner.local) return mode === 'local';
  const auth = useAuthStore.getState();
  return (
    mode === 'cloud' &&
    isCloudAccountEpochCurrent(owner.account) &&
    auth.isClerkLoaded &&
    auth.isClerkSignedIn &&
    auth.clerkUserId === owner.account.ownerId
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function useAgentActivityPushSync(): AgentActivityPushSync {
  const ownerRef = useRef<AgentActivityPushOwner | null>(null);
  const [snapshot, setSnapshot] = useState<AgentActivityPushSync>({
    enabled: true,
    ready: false,
    canRetry: false,
    status: 'loading',
    error: null,
    setEnabled: () => {},
    retry: () => {},
  });

  useEffect(() => {
    const current = (owner: AgentActivityPushOwner, revision = owner.revision) =>
      ownerRef.current === owner && owner.revision === revision && ownerIsCurrent(owner);
    const retire = () => {
      const owner = ownerRef.current;
      ownerRef.current = null;
      owner?.controller.abort();
    };
    const renew = () => {
      retire();
      const owner: AgentActivityPushOwner = {
        account: captureCloudAccountEpoch(),
        local: useChatAppModeStore.getState().appMode === 'local',
        controller: new AbortController(),
        enabled: true,
        ready: false,
        loading: false,
        saving: false,
        failed: false,
        revision: 0,
      };
      ownerRef.current = owner;
      const publish = (status: AgentActivityPushStatus, error: string | null = null) => {
        setSnapshot({
          enabled: owner.enabled,
          ready: owner.ready,
          canRetry:
            !owner.local && current(owner) && owner.failed && !owner.loading && !owner.saving,
          status,
          error,
          setEnabled,
          retry,
        });
      };
      const setEnabled = (value: boolean) => {
        if (!current(owner) || owner.local || !owner.ready || owner.loading || owner.saving) return;
        const previousEnabled = owner.enabled;
        const revision = ++owner.revision;
        owner.enabled = value;
        owner.saving = true;
        owner.failed = false;
        publish('saving');
        if (!current(owner, revision)) return;
        void patchPreferenceNamespace(
          ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
          { [AGENT_ACTIVITY_PUSH_PREFERENCE_KEY]: value },
          { accountEpoch: owner.account, signal: owner.controller.signal },
        ).then(
          () => {
            if (!current(owner, revision)) return;
            owner.saving = false;
            publish('synced');
          },
          () => {
            if (!current(owner, revision)) return;
            owner.saving = false;
            owner.enabled = previousEnabled;
            owner.ready = false;
            owner.failed = true;
            publish(
              'error',
              'Your notification preference could not be saved. The server may have received the change. Retry to reload it.',
            );
          },
        );
      };
      const load = () => {
        if (!current(owner) || owner.local || owner.loading || owner.saving) return;
        const revision = ++owner.revision;
        owner.ready = false;
        owner.loading = true;
        owner.failed = false;
        publish('loading');
        if (!current(owner, revision)) return;
        void fetchPreferenceNamespace(ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE, {
          accountEpoch: owner.account,
          signal: owner.controller.signal,
        }).then(
          (stored) => {
            if (!current(owner, revision)) return;
            owner.enabled = asRecord(stored)[AGENT_ACTIVITY_PUSH_PREFERENCE_KEY] !== false;
            owner.ready = true;
            owner.loading = false;
            publish('synced');
          },
          () => {
            if (!current(owner, revision)) return;
            owner.loading = false;
            owner.failed = true;
            publish(
              'error',
              'Could not load agent run notifications. Check your connection and retry.',
            );
          },
        );
      };
      const retry = () => {
        if (owner.failed) load();
      };
      if (owner.local) publish('local');
      else if (current(owner)) load();
      else publish('error', 'Sign in to load your account notification preference.');
    };
    // Synchronous subscriptions retire lifetimes even when React batches an ABA transition.
    const stopAccount = subscribeCloudAccountEpochChange(renew);
    const stopAuth = useAuthStore.subscribe((next, previous) => {
      if (
        next.clerkUserId !== previous.clerkUserId ||
        next.isClerkSignedIn !== previous.isClerkSignedIn ||
        next.isClerkLoaded !== previous.isClerkLoaded
      ) {
        renew();
      }
    });
    const stopMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) renew();
    });
    renew();
    return () => {
      retire();
      stopAccount();
      stopAuth();
      stopMode();
    };
  }, []);

  return snapshot;
}
