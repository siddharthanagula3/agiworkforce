/**
 * @file chat-session-label-service.ts
 *
 * Labels a newly-created web chat conversation with the `cloud_chat`
 * `AppSession` discriminant from `@agiworkforce/types` `sessions/` (W5
 * discipline wave 1 stage 2) — the session-taxonomy consumer named in
 * `docs/plans/restructure-execution-program-2026-07-15.md` W5 item 1
 * ("First consumers: web chat + desktop composition root + mobile appMode
 * (label their existing sessions)").
 *
 * Pure function: takes the already-persisted `web_conversations` row fields
 * and returns a typed `CloudChatSession` label. Does not touch the
 * database — the caller (`app/api/chat/conversations/route.ts`) asserts its
 * invariants at the actual persistence boundary, right after the insert
 * succeeds, inside the SAME try/catch the route already has. This is
 * additive: on the happy path (a well-formed conversation, which is every
 * conversation this route creates) the assertion is silent and the response
 * shape/status is unchanged; a failing assertion surfaces through the
 * route's EXISTING error path (`logger.error` + `createError.internal`),
 * not a new one.
 */
import type { CloudChatSession } from '@agiworkforce/types';

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
    // This route is web-only (`app/api/chat/conversations`); desktop and
    // mobile create conversations through their own bootstrap paths and
    // label their own `SyncedAppSurface` value there.
    originSurface: 'web',
    accountScope: { projectId: input.projectId ?? null },
    hostRequirement: { required: false },
    policySnapshot: {
      capabilityDocument: {
        sessionId: input.conversationId,
        // No capability handshake has been computed for THIS conversation
        // yet (`GET /api/me`'s `capability_handshake` is the current
        // computed source — see `capability-handshake-service.ts`). This is
        // an honest placeholder reference, not a fabricated grant: no
        // `granted`/`deniedBy` payload is embedded, only the pointer shape
        // `SessionPolicySnapshot` requires. A future pass can compute and
        // attach a real per-conversation document at creation time.
        version: 'unresolved',
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
