import { selectPrivacyMode, useAppModeStore } from './appModeStore';

/**
 * Single source of truth for the desktop privacy trust boundary.
 *
 * Returns `true` when the desktop is in a PRIVATE boundary (Local OR BYOK) and therefore
 * must NOT send chats, files, telemetry, or account data to OUR cloud. Only `'managed'`
 * (AGI-managed cloud) is non-private. BYOK is a per-conversation execution mode
 * inside the Local workspace, so it inherits this private boundary.
 *
 * FAIL-CLOSED: if the privacy mode cannot be read, treat the session as private (block /
 * suppress). Blocking is safe; leaking is not.
 *
 * `egressGuard`, `errorTracking`, and `analytics` all delegate here so this predicate
 * cannot drift across call sites again — it drifted before (a `=== 'local'` check leaked
 * Sentry/analytics telemetry in BYOK), which is exactly the failure this consolidation
 * prevents.
 */
export function isPrivateTrustBoundary(): boolean {
  try {
    return selectPrivacyMode(useAppModeStore.getState()) !== 'managed';
  } catch {
    return true;
  }
}
