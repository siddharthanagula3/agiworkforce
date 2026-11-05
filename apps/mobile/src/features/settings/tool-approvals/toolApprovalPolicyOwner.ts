import {
  CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  isToolApprovalPolicy,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@agiworkforce/types';
import { fetchToolApprovalNamespace, savePreferenceNamespace } from '@/services/preferences';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useSettingsStore } from '@/stores/settingsStore';

export type ToolApprovalSyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

export interface ToolApprovalPolicySync {
  policy: ToolApprovalPolicy;
  autonomyForbidden: boolean;
  ready: boolean;
  canRetry: boolean;
  status: ToolApprovalSyncStatus;
  error: string | null;
  select: (policy: ToolApprovalPolicy) => void;
  retry: () => void;
}

interface Owner {
  local: boolean;
  account: CloudAccountEpoch | null;
  revision: number;
  controller: AbortController;
  confirmed: ToolApprovalPolicy | null;
}

const idle: ToolApprovalPolicySync = {
  policy: DEFAULT_TOOL_APPROVAL_POLICY,
  autonomyForbidden: false,
  ready: false,
  canRetry: false,
  status: 'loading',
  error: null,
  select: () => {},
  retry: () => {},
};
let snapshot = idle;
let owner: Owner | null = null;
const consumers = new Set<() => void>();
let stopSources: (() => void) | null = null;

function eligibleAccount(): CloudAccountEpoch | null {
  const auth = useAuthStore.getState();
  const account = captureCloudAccountEpoch();
  return auth.isClerkLoaded && auth.isClerkSignedIn && account?.ownerId === auth.clerkUserId
    ? account
    : null;
}

function current(candidate: Owner, revision = candidate.revision): boolean {
  if (owner !== candidate || candidate.revision !== revision || consumers.size === 0) return false;
  if (candidate.local) return useChatAppModeStore.getState().appMode === 'local';
  const account = eligibleAccount();
  return (
    useChatAppModeStore.getState().appMode === 'cloud' &&
    isCloudAccountEpochCurrent(candidate.account) &&
    account !== null &&
    account.ownerId === candidate.account.ownerId &&
    account.epoch === candidate.account.epoch
  );
}

function publish(next: ToolApprovalPolicySync): void {
  snapshot = next;
  for (const notify of consumers) notify();
}

function select(candidate: Owner, next: ToolApprovalPolicy): void {
  if (!isToolApprovalPolicy(next) || !current(candidate)) return;
  if (candidate.local) {
    useSettingsStore.getState().setToolApprovalPolicy(next);
    return;
  }
  if (!snapshot.ready || snapshot.status === 'saving' || snapshot.status === 'loading') return;
  if (next === 'autonomous' && snapshot.autonomyForbidden) return;
  const revision = ++candidate.revision;
  publish({ ...snapshot, policy: next, status: 'saving', error: null, canRetry: false });
  if (!current(candidate, revision)) return;
  void savePreferenceNamespace<ToolApprovalPreferences>(
    TOOL_APPROVAL_PREFERENCE_NAMESPACE,
    { defaultPolicy: next },
    { accountEpoch: candidate.account, signal: candidate.controller.signal },
  ).then(
    () => {
      if (!current(candidate, revision)) return;
      candidate.confirmed = next;
      publish({ ...snapshot, status: 'synced' });
    },
    () => {
      if (!current(candidate, revision)) return;
      const confirmed = candidate.confirmed ?? DEFAULT_TOOL_APPROVAL_POLICY;
      publish({
        ...snapshot,
        policy:
          snapshot.autonomyForbidden && confirmed === 'autonomous'
            ? DEFAULT_TOOL_APPROVAL_POLICY
            : confirmed,
        status: 'error',
        canRetry: true,
        error:
          'Your approval default could not be saved. The server may have received the change. Retry to reload it.',
      });
    },
  );
}

function reconcile(): void {
  const local = useChatAppModeStore.getState().appMode === 'local';
  const account = local ? null : eligibleAccount();
  if (
    owner &&
    owner.local === local &&
    owner.account?.ownerId === account?.ownerId &&
    owner.account?.epoch === account?.epoch
  ) {
    if (local && snapshot.policy !== useSettingsStore.getState().toolApprovalPolicy) {
      publish({ ...snapshot, policy: useSettingsStore.getState().toolApprovalPolicy });
    }
    return;
  }
  owner?.controller.abort();
  const candidate: Owner = {
    local,
    account,
    revision: 0,
    controller: new AbortController(),
    confirmed: null,
  };
  owner = candidate;
  publish({
    ...idle,
    policy: local ? useSettingsStore.getState().toolApprovalPolicy : DEFAULT_TOOL_APPROVAL_POLICY,
    ready: local,
    status: local ? 'local' : account ? 'loading' : 'error',
    error: local || account ? null : 'Sign in to load your account approval default.',
    select: (next) => select(candidate, next),
    retry: () => {
      if (!current(candidate) || candidate.local || snapshot.status !== 'error') return;
      load(candidate);
    },
  });
  if (local || !account || !current(candidate)) return;
  load(candidate);
}

function load(candidate: Owner): void {
  const revision = ++candidate.revision;
  publish({
    ...snapshot,
    ready: false,
    autonomyForbidden: false,
    status: 'loading',
    error: null,
    canRetry: false,
  });
  if (!current(candidate, revision)) return;
  void fetchToolApprovalNamespace(TOOL_APPROVAL_PREFERENCE_NAMESPACE, {
    accountEpoch: candidate.account,
    signal: candidate.controller.signal,
  }).then(
    ({ settings, autonomousToolApprovalsAllowed }) => {
      if (!current(candidate, revision)) return;
      const stored = (settings as ToolApprovalPreferences | null)?.defaultPolicy;
      const policy = isToolApprovalPolicy(stored)
        ? stored
        : CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY;
      candidate.confirmed = policy;
      publish({
        ...snapshot,
        policy:
          !autonomousToolApprovalsAllowed && policy === 'autonomous'
            ? DEFAULT_TOOL_APPROVAL_POLICY
            : policy,
        autonomyForbidden: !autonomousToolApprovalsAllowed,
        ready: true,
        status: 'synced',
        error: null,
      });
    },
    () => {
      if (!current(candidate, revision)) return;
      publish({
        ...snapshot,
        status: 'error',
        canRetry: true,
        error: 'Your approval default could not be loaded. Check your connection and retry.',
      });
    },
  );
}

export function subscribeToolApprovalPolicy(notify: () => void): () => void {
  const listener = () => notify();
  consumers.add(listener);
  if (consumers.size === 1) {
    const stops = [
      useAuthStore.subscribe(reconcile),
      useChatAppModeStore.subscribe(reconcile),
      subscribeCloudAccountEpochChange(reconcile),
      useSettingsStore.subscribe(reconcile),
    ];
    stopSources = () => stops.forEach((stop) => stop());
    reconcile();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consumers.delete(listener);
    if (consumers.size !== 0) return;
    stopSources?.();
    stopSources = null;
    owner?.controller.abort();
    owner = null;
    snapshot = idle;
  };
}

export function getToolApprovalPolicySnapshot(): ToolApprovalPolicySync {
  return snapshot;
}

export function toolApprovalPolicySummary(state: ToolApprovalPolicySync): string {
  if (!state.ready) return state.status === 'error' ? 'Unavailable' : 'Loading…';
  const label = toolApprovalPolicyOption(state.policy).shortLabel;
  if (state.status === 'error') return `${label} · Not synced`;
  if (state.status === 'saving') return `${label} · Saving…`;
  return label;
}
