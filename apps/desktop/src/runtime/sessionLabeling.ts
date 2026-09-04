import type { ChatExecutionMode } from '@agiworkforce/types';
import {
  assertExecutionProfile,
  assertSessionInvariants,
  resolveExecutionProfile,
  type AppSession,
  type CloudChatSession,
  type DesktopByokChatSession,
  type DesktopLocalChatSession,
  type ExecutionProfile,
  type ExecutionProfileToggle,
} from '@agiworkforce/types';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import {
  createDesktopChatRuntime,
  type DesktopChatRuntimeEnvironment,
  type DesktopChatRuntimeFactories,
} from './desktopChatRuntime';
import { CloudRuntime } from './CloudRuntime';
import { TauriRuntime } from './TauriRuntime';
import { WebRuntime } from './WebRuntime';

export interface DesktopSessionLabelInput {
  id: string;
  ownerUserId: string;
  chatExecutionMode: ChatExecutionMode;
  createdAt?: string;
  updatedAt?: string;
}

const PENDING_CAPABILITY_HANDSHAKE_VERSION = 'unversioned-pending-capability-handshake';

export function labelDesktopSession(input: DesktopSessionLabelInput): AppSession {
  const now = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? now;
  const policySnapshot = {
    capabilityDocument: {
      sessionId: input.id,
      version: PENDING_CAPABILITY_HANDSHAKE_VERSION,
      computedAt: now,
    },
    permissionPolicyVersion: PENDING_CAPABILITY_HANDSHAKE_VERSION,
    snapshotAt: now,
  };

  if (input.chatExecutionMode === 'local_only') {
    const session: DesktopLocalChatSession = {
      id: input.id,
      kind: 'desktop_local_chat',
      ownerUserId: input.ownerUserId,
      executionLocation: 'device',
      executionAuthority: 'local_device',
      storageScope: 'local_device',
      syncPolicy: { syncEligible: false },
      trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      originSurface: 'desktop',
      accountScope: {},
      hostRequirement: { required: true, liveness: 'online' },
      policySnapshot,
      retentionPolicy: { deletionPolicy: 'user_deletable' },
      handoff: { canBeHandoffSource: true, canBeHandoffTarget: false },
      createdAt: now,
      updatedAt,
    };
    assertSessionInvariants(session);
    return session;
  }

  if (input.chatExecutionMode === 'byok') {
    const session: DesktopByokChatSession = {
      id: input.id,
      kind: 'desktop_byok_chat',
      ownerUserId: input.ownerUserId,
      executionLocation: 'device',
      executionAuthority: 'byok_provider_account',
      storageScope: 'direct_byok_provider',
      syncPolicy: { syncEligible: false },
      trustBoundary: { privacyMode: 'byok', providerMode: 'DirectByok' },
      originSurface: 'desktop',
      accountScope: {},
      hostRequirement: { required: true, liveness: 'online' },
      policySnapshot,
      retentionPolicy: { deletionPolicy: 'user_deletable' },
      handoff: { canBeHandoffSource: false, canBeHandoffTarget: true },
      createdAt: now,
      updatedAt,
    };
    assertSessionInvariants(session);
    return session;
  }

  const session: CloudChatSession = {
    id: input.id,
    kind: 'cloud_chat',
    ownerUserId: input.ownerUserId,
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'synced_app_cloud',
    syncPolicy: { syncEligible: true, syncedSurfaces: ['web', 'desktop', 'mobile'] },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
    originSurface: 'desktop',
    accountScope: {},
    hostRequirement: { required: false },
    policySnapshot,
    retentionPolicy: { deletionPolicy: 'user_deletable' },
    handoff: { canBeHandoffSource: false, canBeHandoffTarget: true },
    createdAt: now,
    updatedAt,
  };
  assertSessionInvariants(session);
  return session;
}

export function desktopExecutionProfileFor(mode: ChatExecutionMode): ExecutionProfile {
  const profile =
    mode === 'cloud_managed'
      ? resolveExecutionProfile({ toggle: 'cloud' })
      : resolveExecutionProfile({
          toggle: 'local',
          localInferenceMode: mode === 'byok' ? 'DirectByok' : 'Local',
        });
  assertExecutionProfile(profile);
  return profile;
}

export function assertDesktopRuntimeAgreesWithExecutionProfile(
  profile: ExecutionProfile,
  runtime: ChatRuntime,
): void {
  const isCloudLikeRuntime = runtime instanceof CloudRuntime || runtime instanceof WebRuntime;
  const isTauriRuntime = runtime instanceof TauriRuntime;

  if (profile.toggle === 'local' && isCloudLikeRuntime) {
    throw new Error(
      'AGI desktop runtime-agreement violation: a local ExecutionProfile ' +
        `(providerMode "${profile.inference.providerMode}") resolved to a cloud-persistence ` +
        'runtime (CloudRuntime/WebRuntime). Local/BYOK conversations must never reach the ' +
        'cloud persistence client.',
    );
  }
  if (profile.toggle === 'cloud' && isTauriRuntime) {
    throw new Error(
      'AGI desktop runtime-agreement violation: a cloud ExecutionProfile resolved to ' +
        'TauriRuntime, which has no cloud persistence path. Managed-cloud conversations must ' +
        'be served by CloudRuntime or WebRuntime.',
    );
  }
}

function impliedToggleFor(environment: DesktopChatRuntimeEnvironment): ExecutionProfileToggle {
  if (!environment.isTauriHost) return 'cloud';
  return environment.appMode === 'cloud' ? 'cloud' : 'local';
}

export function createDesktopChatRuntimeWithLabeling(
  environment: DesktopChatRuntimeEnvironment,
  factories?: DesktopChatRuntimeFactories,
): ChatRuntime {
  const runtime = createDesktopChatRuntime(environment, factories);
  if (import.meta.env.DEV) {
    const profile = resolveExecutionProfile({ toggle: impliedToggleFor(environment) });
    assertExecutionProfile(profile);
    assertDesktopRuntimeAgreesWithExecutionProfile(profile, runtime);
  }
  return runtime;
}
