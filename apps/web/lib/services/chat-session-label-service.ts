import { CAPABILITY_DOCUMENT_VERSION_UNRESOLVED, type CloudChatSession } from '@agiworkforce/types';

export interface BuildCloudChatSessionLabelInput {
  conversationId: string;
  ownerUserId: string;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function buildCloudChatSessionLabel(
  input: BuildCloudChatSessionLabelInput,
): CloudChatSession {
  return {
    id: input.conversationId,
    kind: 'cloud_chat',
    ownerUserId: input.ownerUserId,
    executionLocation: 'managed-cloud',
    executionAuthority: 'managed_cloud_service',
    storageScope: 'synced_app_cloud',
    syncPolicy: { syncEligible: true },
    trustBoundary: { privacyMode: 'managed', providerMode: 'ManagedGateway' },
    originSurface: 'web',
    accountScope: { projectId: input.projectId ?? null },
    hostRequirement: { required: false },
    policySnapshot: {
      capabilityDocument: {
        sessionId: input.conversationId,
        version: CAPABILITY_DOCUMENT_VERSION_UNRESOLVED,
        computedAt: input.createdAt,
      },
      permissionPolicyVersion: 'v1',
      snapshotAt: input.createdAt,
    },
    retentionPolicy: { deletionPolicy: 'user_deletable' },
    handoff: { canBeHandoffSource: true, canBeHandoffTarget: true },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}
