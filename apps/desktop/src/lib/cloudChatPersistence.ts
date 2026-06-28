/**
 * DCL-2 — Desktop managed-cloud chat persistence seam.
 *
 * Desktop Cloud mode uses the SAME backend as web (the "one logical cloud"
 * invariant): the shared `@agiworkforce/unified-chat` persistence client talking
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
 * GATED (PA-3 coming-soon): while PA-3's gate holds, `appModeStore.setMode`
 * refuses to enter Cloud mode on the desktop runtime (`supportsLocalAppMode`),
 * so `selectPrivacyMode` can NEVER return `'managed'` on desktop. That makes
 * `getDesktopCloudChatPersistenceClient()` unreachable through the user-facing
 * path today — the seam is built and unit-tested, but no signed-build user can
 * reach it. DCL-4 flips the gate (and the copy) on a verified signed build.
 *
 * @module cloudChatPersistence
 */
import {
  createCloudChatPersistenceClient,
  type CloudChatPersistenceClient,
} from '@agiworkforce/unified-chat';
import { WEB_APP_URL } from '../api/config';
import { guardedFetch } from './egressGuard';
import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { useAuthStore } from '../stores/auth';

/**
 * True only when the desktop is in the managed-cloud trust boundary. While
 * PA-3's coming-soon gate holds this is always `false` on the desktop runtime
 * (Cloud mode is refused), which is what keeps the persistence client
 * unreachable for users until DCL-4.
 */
export function isManagedCloudPersistenceActive(): boolean {
  try {
    return selectPrivacyMode(useAppModeStore.getState()) === 'managed';
  } catch {
    // Fail-closed: an unreadable store is treated as a private boundary.
    return false;
  }
}

/**
 * Returns the Clerk/desktop cloud session token for the `Authorization` header,
 * or `null` when unauthenticated. Reads the canonical desktop auth store.
 */
async function getDesktopCloudAuthToken(): Promise<string | null> {
  try {
    return useAuthStore.getState().accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the desktop managed-cloud chat persistence client.
 *
 * MANAGED-CLOUD ONLY — throws in Local or BYOK so neither boundary can route
 * through the shared cloud backend. Uses:
 *   - `baseUrl`        = `WEB_APP_URL` (absolute cloud origin from `api/config`)
 *   - `getAuthToken`   = the desktop Clerk session token getter
 *   - `decorateHeaders`= none (desktop has no CSRF; identity headers)
 *   - `fetchImpl`      = `guardedFetch` (the egress seam)
 *
 * @throws Error when not in managed Cloud mode (Local/BYOK, or the PA-3 gate).
 */
export function getDesktopCloudChatPersistenceClient(): CloudChatPersistenceClient {
  if (!isManagedCloudPersistenceActive()) {
    throw new Error(
      '[cloud-chat] managed-cloud persistence is unavailable: desktop is not in managed Cloud mode. ' +
        'Local and BYOK route to the Rust runtime; the PA-3 coming-soon gate keeps desktop Cloud closed until DCL-4.',
    );
  }
  return createCloudChatPersistenceClient({
    // Absolute cloud origin — never a web-relative path on desktop.
    baseUrl: WEB_APP_URL,
    getAuthToken: getDesktopCloudAuthToken,
    // No decorateHeaders: desktop has no CSRF token to inject.
    fetchImpl: guardedFetch,
  });
}
