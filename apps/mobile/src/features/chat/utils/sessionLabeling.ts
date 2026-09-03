import {
  assertExecutionProfile,
  assertSessionInvariants,
  resolveExecutionProfile,
  type AppSession,
  type CloudChatSession,
  type ExecutionProfile,
  type MobileLocalChatSession,
} from '@agiworkforce/types';
import type { ConversationExecutionMode } from './conversationMode';

const PENDING_CAPABILITY_HANDSHAKE_VERSION = 'unversioned-pending-capability-handshake';

export interface MobileSessionLabelInput {
  id: string;
  ownerUserId: string;
  executionMode: ConversationExecutionMode;
  createdAt?: string;
  updatedAt?: string;
}

export function labelMobileSession(input: MobileSessionLabelInput): AppSession {
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

  if (input.executionMode === 'local') {
    const session: MobileLocalChatSession = {
      id: input.id,
      kind: 'mobile_local_chat',
      ownerUserId: input.ownerUserId,
      executionLocation: 'device',
      executionAuthority: 'local_device',
      storageScope: 'local_device',
      syncPolicy: { syncEligible: false },
      trustBoundary: { privacyMode: 'local', providerMode: 'Local' },
      originSurface: 'mobile',
      accountScope: {},
      hostRequirement: { required: true, liveness: 'online' },
      policySnapshot,
      retentionPolicy: { deletionPolicy: 'user_deletable' },
      handoff: { canBeHandoffSource: false, canBeHandoffTarget: false },
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
    originSurface: 'mobile',
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

export function mobileExecutionProfileFor(mode: ConversationExecutionMode): ExecutionProfile {
  const profile = resolveExecutionProfile({ toggle: mode === 'cloud' ? 'cloud' : 'local' });
  assertExecutionProfile(profile);
  return profile;
}
