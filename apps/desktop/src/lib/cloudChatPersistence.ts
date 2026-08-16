/**
 * DCL-2 — Desktop managed-cloud chat persistence seam.
 *
 * Desktop Cloud mode uses the SAME backend as web (the "one logical cloud"
 * invariant): the canonical `@agiworkforce/cloud-contracts` client talking
 * to `/api/chat/conversations*` on the ABSOLUTE cloud origin, routed through the
 * egress guard. There is no Rust path for cloud persistence — cloud goes through
 * the web API boundary, never the local Tauri runtime (the orphaned Rust
 * `cloud_*` commands stay fail-closed; see
 * `src-tauri/src/sys/commands/chat/cloud.rs`).
 *
 * TRUST BOUNDARY (P0): this seam is MANAGED-CLOUD ONLY.
 *   - Local + BYOK MUST NOT use this client — they route to the Rust runtime.
 *     `getDesktopCloudChatPersistenceClient()` throws unless `privacyMode` is
 *     `'managed'`, so a Local/BYOK caller can never instantiate it.
 *   - `fetchImpl` is `guardedFetch`: even if a caller bypassed the precondition,
 *     the egress guard blocks any our-cloud call outside managed mode.
 *
 * Cloud mode is public alpha and reachable only after the mode/auth
 * orchestrator admits a signed-in managed session.
 *
 * @module cloudChatPersistence
 */
import type { ManagedCloudChatClient } from '@agiworkforce/cloud-contracts';
import { createCloudChatPersistenceClient } from '../api/cloudApi';
import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';

export function isManagedCloudPersistenceActive(): boolean {
  try {
    return (
      selectPrivacyMode(useAppModeStore.getState()) === 'managed' &&
      selectHasCloudAccountSession(useAuthStore.getState())
    );
  } catch {
    return false;
  }
}

/**
 * Build the desktop managed-cloud chat persistence client.
 *
 * MANAGED-CLOUD ONLY — throws in Local or BYOK so neither boundary can route
 * through the shared cloud backend. Uses:
 * The canonical client factory in `api/cloudApi` supplies the absolute Cloud
 * origin, validates token expiry before every request, routes transport
 * through the egress guard, and centrally invalidates a rejected 401 session.
 *
 * @throws Error when not in an authenticated managed Cloud session.
 */
export function getDesktopCloudChatPersistenceClient(): ManagedCloudChatClient {
  if (!isManagedCloudPersistenceActive()) {
    throw new Error(
      '[cloud-chat] managed-cloud persistence is unavailable: desktop is not in managed Cloud mode. ' +
        'Local and BYOK route to the Rust runtime.',
    );
  }
  const accountId = useAuthStore.getState().user?.id;
  if (!accountId) {
    throw new Error(
      '[cloud-chat] managed-cloud persistence is unavailable: the authenticated account has no owner id.',
    );
  }
  return createCloudChatPersistenceClient(accountId);
}
