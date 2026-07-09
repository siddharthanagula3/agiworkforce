/**
 * Settings sync gating — pure decisions extracted from mobile's
 * cloudSyncEngine.ts (pushSettings / pullSettings, pre-Wave-4).
 *
 * SCOPE NOTE: the single-document LWW settings sync has two layers —
 * (1) WHEN to push/apply (pure booleans over cursors and snapshot strings,
 * identical shape across every surface), and (2) WHICH fields to project onto
 * the wire and back (mobile: services/cloudSettingsMapping.ts's
 * toCloudSettings/applyCloudSettings, built on mobile-only store types like
 * ThemeMode/FontPreference/PersonalizationStyle). Only (1) is extracted here.
 * (2) stays surface-owned: web and desktop have their own distinct settings
 * store shapes with no shared type to project through a common apply
 * function, so unifying it would mean inventing a cross-surface settings
 * schema no surface actually uses yet — out of scope for this extraction.
 */

/**
 * Should a settings push happen? Two guards:
 *   1. `settingsUpdatedAt !== null` — null means this device has never
 *      changed a cloud-safe setting (factory defaults). A fresh device must
 *      NOT push defaults before pulling, or it would clobber the user's
 *      existing cloud settings via server-side LWW.
 *   2. The current projection differs from what was last pushed — skip
 *      redundant POSTs on background sync cycles when nothing changed.
 */
export function shouldPushSettings(
  settingsUpdatedAt: string | null,
  currentSnapshotJson: string,
  lastPushedSnapshotJson: string,
): boolean {
  if (settingsUpdatedAt === null) return false;
  return currentSnapshotJson !== lastPushedSnapshotJson;
}

/**
 * Should a pulled settings response be applied to the live store? Only when
 * the cursor actually advanced (something changed server-side) AND the
 * pulled namespace bag is non-empty (an unchanged response is a no-op that
 * must not be treated as "apply nothing, but still count as a local change").
 */
export function shouldApplyPulledSettings(
  advancedCursor: string,
  previousCursor: string,
  pulledNamespaceCount: number,
): boolean {
  return advancedCursor !== previousCursor && pulledNamespaceCount > 0;
}
