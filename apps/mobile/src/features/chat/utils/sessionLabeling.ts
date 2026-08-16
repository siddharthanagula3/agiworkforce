/**
 * Mobile session labeling — the stage-2 consumer wiring for
 * `@agiworkforce/types`'s session-taxonomy and ExecutionProfile contracts
 * (packages/contracts/types/src/sessions/). Purely additive: this module LABELS the
 * chat store's existing Local/Cloud decision (`ConversationExecutionMode`
 * from `./conversationMode`) with the shared contracts and asserts they
 * agree with what the app actually enforces — it does not change which
 * runtime path a message takes or any existing control flow.
 *
 * Mobile has no BYOK mode (Surface Trust Modes: Mobile = Local + Cloud only),
 * so labeling here is a clean two-way map, unlike desktop's three-way
 * local_only/byok/cloud_managed split.
 *
 * Enforcement of the trust boundary itself continues to live in the real
 * 4-layer guard (`useChatAppModeStore` -> `services/remoteChatGate` ->
 * `conversationMode` resolution -> `lib/egressGuard.ts`'s fail-closed
 * `guardedFetch`); this module only checks that the label agrees with it —
 * see `__tests__/session-labeling.test.ts` for the direct agreement proof
 * against the real `guardedFetch`/`isOurCloudHost`.
 *
 * KNOWN GAP (flag for review, not papered over): `policySnapshot`'s
 * `capabilityDocument.version` and `permissionPolicyVersion` are explicit,
 * clearly-named placeholders (`'unversioned-pending-capability-handshake'`),
 * not real version data — the W5 item-3 capability/permission handshake
 * (`packages/contracts/types/src/capability-handshake/`, sibling-owned) is not
 * consumed on mobile yet. Do not read these values as evidence a handshake
 * ran; replace them with the real handshake output once mobile consumes it.
 *
 * @module features/chat/utils/sessionLabeling
 */

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
