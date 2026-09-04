/**
 * AGI session taxonomy: the discriminated `SessionKind` contract required by
 * `docs/research/competitor-capability-session-architecture-2026-07-15.md`
 * §4.2 ("Required AGI session discriminants") and §4.3 (cloud-work vs
 * remote-projection separation), locked against the cross-surface boundary
 * table in §5 of the same document.
 *
 * This module composes with, and never forks, the existing trust kernel in
 * `../suite-contracts`: `PrivacyMode`, `ProviderMode`, `StorageScope`,
 * `SourceSurface`, `SyncedAppSurface`, `DeveloperSessionSurface`, and the
 * `isSyncedAppSurface` / `assertSurfaceCanSyncChats` sync-boundary guards are
 * imported, not redefined. Every session's sync eligibility must remain
 * consistent with that guard, see `validateSessionInvariants` below.
 *
 * Design assumptions made where the source spec is directive but not fully
 * exhaustive (first-cut contract; consumers and any correction land after
 * orchestrator review per the W5 dispatch):
 *
 *  - `executionAuthority` is a new, session-scoped enum naming WHO/WHAT runs
 *    the session (the device owner, the user's own BYOK provider account,
 *    AGI-managed cloud, a developer-workspace host, a browser profile, or a
 *    relay/control plane). It is intentionally distinct from
 *    `trustBoundary.providerMode`, which names the request-routing path for
 *    a single turn, e.g. a `developer_local` session keeps
 *    `executionAuthority: 'developer_workspace_host'` even when a given
 *    model call routes `DirectByok` or `ManagedGateway`, mirroring
 *    `DeveloperSession`'s existing independence of `privacyMode`/
 *    `providerMode` from session storage scope.
 *  - `desktop_byok_chat`'s `executionLocation` is `'device'`, not a fourth
 *    location value: the session/control plane is device-resident and only
 *    the model call crosses to the user's provider
 *    (`apps/desktop/src/runtime/desktopChatRuntime.ts`: "Local-only and BYOK
 *    conversations both live here"). BYOK is discriminated by
 *    `trustBoundary` / `executionAuthority`, not by location.
 *  - `remote_projection` and the two developer kinds share
 *    `storageScope: 'developer_workspace'`, CC §4.1 clusters "Local
 *    developer session", "Managed developer task", and "Remote local
 *    developer projection" as one family, and §4.3 explicitly forbids
 *    treating a projected developer run as consumer-chat data.
 *  - `handoff_snapshot` is an at-rest reviewed bundle, not a live executing
 *    session (compare `HandoffDraft` in `../suite-contracts`, which this
 *    complements rather than duplicates). Its `executionLocation`,
 *    `executionAuthority`, and `storageScope` use the general unions and are
 *    expected to mirror whatever the *source* session reported at snapshot
 *    time, there is no independent execution for a snapshot to report.
 *  - Eight of the eleven kinds have a fully fixed `syncPolicy.syncEligible`
 *    (`false`, enforced at the type level) because §5 makes that boundary
 *    absolute, not conditional. The three managed/cloud kinds keep it as a
 *    general `boolean` because a specific instance can still opt out (e.g. a
 *    `ChatIntent.temporary` turn), so `true` is allowed but never required.
 *
 * @module sessions/taxonomy
 */

import type {
  DeveloperSessionSurface,
  PrivacyMode,
  ProviderMode,
  SourceSurface,
  StorageScope,
  SyncedAppSurface,
} from '../suite-contracts';
import { isSyncedAppSurface, providerModeToPrivacyMode } from '../suite-contracts';
import type { CapabilityDocumentRef } from '../capability-handshake';

export type SessionKind =
  | 'cloud_chat'
  | 'cloud_work'
  | 'managed_sandbox'
  | 'desktop_local_chat'
  | 'desktop_byok_chat'
  | 'mobile_local_chat'
  | 'developer_local'
  | 'developer_cloud'
  | 'browser_task'
  | 'remote_projection'
  | 'handoff_snapshot';

export const SESSION_KINDS = [
  'cloud_chat',
  'cloud_work',
  'managed_sandbox',
  'desktop_local_chat',
  'desktop_byok_chat',
  'mobile_local_chat',
  'developer_local',
  'developer_cloud',
  'browser_task',
  'remote_projection',
  'handoff_snapshot',
] as const satisfies readonly SessionKind[];

export function isSessionKind(value: string): value is SessionKind {
  return (SESSION_KINDS as readonly string[]).includes(value);
}

export type SessionExecutionLocation = 'device' | 'managed-cloud' | 'hybrid-projection';

export type SessionExecutionAuthority =
  | 'local_device'
  | 'byok_provider_account'
  | 'managed_cloud_service'
  | 'developer_workspace_host'
  | 'browser_profile'
  | 'relay_control_plane';

export const SESSION_EXECUTION_AUTHORITIES = [
  'local_device',
  'byok_provider_account',
  'managed_cloud_service',
  'developer_workspace_host',
  'browser_profile',
  'relay_control_plane',
] as const satisfies readonly SessionExecutionAuthority[];

export interface SessionTrustBoundary {
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
}

export type SessionHostLiveness = 'online' | 'offline' | 'unknown';

export interface SessionHostRequirement {
  required: boolean;
  hostId?: string | null;
  liveness?: SessionHostLiveness;
}

export interface SessionAccountScope {
  organizationId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
}

export interface SessionSyncPolicy {
  syncEligible: boolean;
  syncedSurfaces?: readonly SyncedAppSurface[];
}

export interface SessionPolicySnapshot {
  capabilityDocument: CapabilityDocumentRef;
  permissionPolicyVersion: string;
  snapshotAt: string;
}

export type SessionDeletionPolicy =
  | 'user_deletable'
  | 'auto_expiring'
  | 'retained_for_audit'
  | 'immediate_on_disconnect';

export interface SessionRetentionPolicy {
  retentionExpiresAt?: string | null;
  deletionPolicy: SessionDeletionPolicy;
}

export interface SessionHandoffProvenance {
  handoffDraftId: string;
  sourceSessionId: string;
  sourceSurface: DeveloperSessionSurface | SyncedAppSurface;
  acceptedAt: string;
}

export interface SessionHandoffPolicy {
  canBeHandoffSource: boolean;
  canBeHandoffTarget: boolean;
  provenance?: SessionHandoffProvenance | null;
}

interface SessionBase<K extends SessionKind> {
  id: string;
  kind: K;
  ownerUserId: string;
  executionLocation: SessionExecutionLocation;
  executionAuthority: SessionExecutionAuthority;
  storageScope: StorageScope;
  syncPolicy: SessionSyncPolicy;
  trustBoundary: SessionTrustBoundary;
  originSurface: SourceSurface;
  accountScope: SessionAccountScope;
  hostRequirement: SessionHostRequirement;
  policySnapshot: SessionPolicySnapshot;
  retentionPolicy: SessionRetentionPolicy;
  handoff: SessionHandoffPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface CloudChatSession extends SessionBase<'cloud_chat'> {
  originSurface: SyncedAppSurface;
  storageScope: Extract<StorageScope, 'synced_app_cloud'>;
  trustBoundary: {
    privacyMode: Extract<PrivacyMode, 'managed'>;
    providerMode: Extract<ProviderMode, 'ManagedGateway' | 'ManagedNative'>;
  };
}

export interface CloudWorkSession extends SessionBase<'cloud_work'> {
  originSurface: SyncedAppSurface;
  storageScope: Extract<StorageScope, 'managed_compute'>;
  trustBoundary: {
    privacyMode: Extract<PrivacyMode, 'managed'>;
    providerMode: Extract<ProviderMode, 'ManagedGateway' | 'ManagedNative'>;
  };
}

export interface ManagedSandboxSession extends SessionBase<'managed_sandbox'> {
  originSurface: SyncedAppSurface;
  storageScope: Extract<StorageScope, 'managed_compute'>;
  trustBoundary: {
    privacyMode: Extract<PrivacyMode, 'managed'>;
    providerMode: Extract<ProviderMode, 'ManagedGateway' | 'ManagedNative'>;
  };
}

export interface DesktopLocalChatSession extends SessionBase<'desktop_local_chat'> {
  originSurface: Extract<SourceSurface, 'desktop'>;
  storageScope: Extract<StorageScope, 'local_device'>;
  trustBoundary: {
    privacyMode: Extract<PrivacyMode, 'local'>;
    providerMode: Extract<ProviderMode, 'Local'>;
  };
  syncPolicy: { syncEligible: false };
}

export interface DesktopByokChatSession extends SessionBase<'desktop_byok_chat'> {
  originSurface: Extract<SourceSurface, 'desktop'>;
  storageScope: Extract<StorageScope, 'direct_byok_provider'>;
  trustBoundary: {
    privacyMode: Extract<PrivacyMode, 'byok'>;
    providerMode: Extract<ProviderMode, 'DirectByok'>;
  };
  syncPolicy: { syncEligible: false };
}

export interface MobileLocalChatSession extends SessionBase<'mobile_local_chat'> {
  originSurface: Extract<SourceSurface, 'mobile'>;
  storageScope: Extract<StorageScope, 'local_device'>;
  trustBoundary: {
    privacyMode: Extract<PrivacyMode, 'local'>;
    providerMode: Extract<ProviderMode, 'Local'>;
  };
  syncPolicy: { syncEligible: false };
}

export interface DeveloperLocalSession extends SessionBase<'developer_local'> {
  originSurface: DeveloperSessionSurface;
  storageScope: Extract<StorageScope, 'developer_workspace'>;
  syncPolicy: { syncEligible: false };
}

export interface DeveloperCloudSession extends SessionBase<'developer_cloud'> {
  originSurface: DeveloperSessionSurface;
  storageScope: Extract<StorageScope, 'developer_workspace'>;
  syncPolicy: { syncEligible: false };
}

export interface BrowserTaskSession extends SessionBase<'browser_task'> {
  originSurface: Extract<SourceSurface, 'chrome'>;
  storageScope: Extract<StorageScope, 'local_device'>;
  syncPolicy: { syncEligible: false };
}

export interface RemoteProjectionSession extends SessionBase<'remote_projection'> {
  originSurface: Extract<SourceSurface, 'cli' | 'desktop'>;
  executionLocation: Extract<SessionExecutionLocation, 'hybrid-projection'>;
  executionAuthority: Extract<SessionExecutionAuthority, 'relay_control_plane'>;
  storageScope: Extract<StorageScope, 'developer_workspace'>;
  hostRequirement: { required: true; hostId?: string | null; liveness: SessionHostLiveness };
  syncPolicy: { syncEligible: false };
}

export interface HandoffSnapshotSession extends SessionBase<'handoff_snapshot'> {
  originSurface: SourceSurface;
  syncPolicy: { syncEligible: false };
  handoff: SessionHandoffPolicy & { canBeHandoffSource: false };
}

export type AppSession =
  | CloudChatSession
  | CloudWorkSession
  | ManagedSandboxSession
  | DesktopLocalChatSession
  | DesktopByokChatSession
  | MobileLocalChatSession
  | DeveloperLocalSession
  | DeveloperCloudSession
  | BrowserTaskSession
  | RemoteProjectionSession
  | HandoffSnapshotSession;

export type SessionOfKind<K extends SessionKind> = Extract<AppSession, { kind: K }>;

export interface SessionKindDefaults {
  executionLocation: SessionExecutionLocation;
  executionAuthority: SessionExecutionAuthority;
  storageScope: StorageScope;
  syncEligible: boolean;
  hostRequirement: SessionHostRequirement;
  trustBoundary: SessionTrustBoundary;
}

export function getSessionKindDefaults(kind: SessionKind): SessionKindDefaults {
  switch (kind) {
    case 'cloud_chat':
      return {
        executionLocation: 'managed-cloud',
        executionAuthority: 'managed_cloud_service',
        storageScope: 'synced_app_cloud',
        syncEligible: true,
        hostRequirement: { required: false },
        trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
      };
    case 'cloud_work':
      return {
        executionLocation: 'managed-cloud',
        executionAuthority: 'managed_cloud_service',
        storageScope: 'managed_compute',
        syncEligible: true,
        hostRequirement: { required: false },
        trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
      };
    case 'managed_sandbox':
      return {
        executionLocation: 'managed-cloud',
        executionAuthority: 'managed_cloud_service',
        storageScope: 'managed_compute',
        syncEligible: true,
        hostRequirement: { required: false },
        trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedNative' },
      };
    case 'desktop_local_chat':
      return {
        executionLocation: 'device',
        executionAuthority: 'local_device',
        storageScope: 'local_device',
        syncEligible: false,
        hostRequirement: { required: true, liveness: 'online' },
        trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      };
    case 'desktop_byok_chat':
      return {
        executionLocation: 'device',
        executionAuthority: 'byok_provider_account',
        storageScope: 'direct_byok_provider',
        syncEligible: false,
        hostRequirement: { required: true, liveness: 'online' },
        trustBoundary: { privacyMode: 'byok', providerMode: 'DirectByok' },
      };
    case 'mobile_local_chat':
      return {
        executionLocation: 'device',
        executionAuthority: 'local_device',
        storageScope: 'local_device',
        syncEligible: false,
        hostRequirement: { required: true, liveness: 'online' },
        trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      };
    case 'developer_local':
      return {
        executionLocation: 'device',
        executionAuthority: 'developer_workspace_host',
        storageScope: 'developer_workspace',
        syncEligible: false,
        hostRequirement: { required: true, liveness: 'online' },
        trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      };
    case 'developer_cloud':
      return {
        executionLocation: 'managed-cloud',
        executionAuthority: 'managed_cloud_service',
        storageScope: 'developer_workspace',
        syncEligible: false,
        hostRequirement: { required: false },
        trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
      };
    case 'browser_task':
      return {
        executionLocation: 'device',
        executionAuthority: 'browser_profile',
        storageScope: 'local_device',
        syncEligible: false,
        hostRequirement: { required: true, liveness: 'online' },
        trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      };
    case 'remote_projection':
      return {
        executionLocation: 'hybrid-projection',
        executionAuthority: 'relay_control_plane',
        storageScope: 'developer_workspace',
        syncEligible: false,
        hostRequirement: { required: true, liveness: 'unknown' },
        trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      };
    case 'handoff_snapshot':
      return {
        executionLocation: 'device',
        executionAuthority: 'local_device',
        storageScope: 'local_device',
        syncEligible: false,
        hostRequirement: { required: false },
        trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      };
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled SessionKind: ${String(exhaustive)}`);
    }
  }
}

const SYNC_ELIGIBLE_KINDS: ReadonlySet<SessionKind> = new Set<SessionKind>([
  'cloud_chat',
  'cloud_work',
  'managed_sandbox',
]);

export type SessionInvariantViolationCode =
  | 'trust-boundary-provider-mismatch'
  | 'sync-eligible-kind-not-allowed'
  | 'sync-eligible-surface-not-synced'
  | 'remote-projection-requires-live-host'
  | 'handoff-snapshot-requires-provenance-or-pending-consent';

export interface SessionInvariantViolation {
  code: SessionInvariantViolationCode;
  message: string;
}

export function validateSessionInvariants(session: AppSession): SessionInvariantViolation[] {
  const violations: SessionInvariantViolation[] = [];
  const add = (code: SessionInvariantViolationCode, message: string) =>
    violations.push({ code, message });

  if (
    providerModeToPrivacyMode(session.trustBoundary.providerMode) !==
    session.trustBoundary.privacyMode
  ) {
    add(
      'trust-boundary-provider-mismatch',
      `providerMode "${session.trustBoundary.providerMode}" does not imply privacyMode "${session.trustBoundary.privacyMode}".`,
    );
  }

  if (session.syncPolicy.syncEligible && !SYNC_ELIGIBLE_KINDS.has(session.kind)) {
    add(
      'sync-eligible-kind-not-allowed',
      `Session kind "${session.kind}" must never report syncPolicy.syncEligible=true (CC §4.3/§5).`,
    );
  }

  if (session.syncPolicy.syncEligible && !isSyncedAppSurface(session.originSurface)) {
    add(
      'sync-eligible-surface-not-synced',
      `Session kind "${session.kind}" claims syncEligible from non-synced originSurface "${session.originSurface}".`,
    );
  }

  if (
    session.kind === 'remote_projection' &&
    (!session.hostRequirement.required || !session.hostRequirement.liveness)
  ) {
    add(
      'remote-projection-requires-live-host',
      'remote_projection sessions must carry hostRequirement.required=true and a liveness value.',
    );
  }

  if (
    session.kind === 'handoff_snapshot' &&
    !session.handoff.canBeHandoffTarget &&
    !session.handoff.provenance
  ) {
    add(
      'handoff-snapshot-requires-provenance-or-pending-consent',
      'handoff_snapshot sessions must either be a pending handoff target or carry accepted-handoff provenance.',
    );
  }

  return violations;
}

export function assertSessionInvariants(session: AppSession): void {
  const violations = validateSessionInvariants(session);
  if (violations.length === 0) return;
  const codes = violations.map((v) => v.code).join(', ');
  const messages = violations.map((v) => `- ${v.code}: ${v.message}`).join('\n');
  throw new Error(`AGI session-taxonomy invariant violation [${codes}]:\n${messages}`);
}
