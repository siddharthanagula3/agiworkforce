/**
 * Settings sync gating — pure decisions extracted from mobile's
 * cloudSyncEngine.ts (pushSettings / pullSettings, pre-Wave-4).
 *
 * SCOPE NOTE: the single-document revision-based settings sync has two layers —
 * (1) WHEN to push/apply (pure booleans over a local dirty marker, cursors,
 * and snapshot strings,
 * identical shape across every surface), and (2) WHICH fields to project onto
 * the wire and back (mobile: services/cloudSettingsMapping.ts's
 * toCloudSettings/applyCloudSettings, built on mobile-only store types like
 * ThemeMode/FontPreference/PersonalizationStyle). Only (1) is extracted here.
 * (2) stays surface-owned: web and desktop have their own distinct settings
 * store shapes with no shared type to project through a common apply
 * function, so unifying it would mean inventing a cross-surface settings
 * schema no surface actually uses yet — out of scope for this extraction.
 */

import type { CloudSafeSettings } from '@agiworkforce/cloud-contracts';

type JsonObject = Record<string, unknown>;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSafeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSafeJsonValue);
  if (!isJsonObject(value)) return value;
  const cloned: JsonObject = {};
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    cloned[key] = cloneSafeJsonValue(nested);
  }
  return cloned;
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValueEquals(value, right[index]))
    );
  }
  if (!isJsonObject(left) || !isJsonObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) && jsonValueEquals(left[key], right[key]),
    )
  );
}

function mergeJsonObjects(base: JsonObject, overlay: JsonObject): JsonObject {
  const merged: JsonObject = {};
  for (const [key, baseValue] of Object.entries(base)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    merged[key] = cloneSafeJsonValue(baseValue);
  }
  for (const [key, overlayValue] of Object.entries(overlay)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    const baseValue = base[key];
    merged[key] =
      isJsonObject(baseValue) && isJsonObject(overlayValue)
        ? mergeJsonObjects(baseValue, overlayValue)
        : cloneSafeJsonValue(overlayValue);
  }
  return merged;
}

/**
 * Merge a partial cloud-safe settings document without replacing an entire
 * namespace. This preserves keys owned by another surface (for example a Web
 * editor preference when Mobile updates only the theme).
 */
export function mergeCloudSafeSettings(
  base: CloudSafeSettings,
  overlay: CloudSafeSettings,
): CloudSafeSettings {
  return mergeJsonObjects(base, overlay) as CloudSafeSettings;
}

function diffJsonObjects(base: JsonObject, current: JsonObject): JsonObject {
  const changed: JsonObject = {};
  // Deliberately iterate only current keys. A narrower client omitting a field
  // does not own that field and therefore cannot delete it accidentally.
  for (const [key, currentValue] of Object.entries(current)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    const baseValue = base[key];
    if (isJsonObject(currentValue)) {
      const nested = diffJsonObjects(isJsonObject(baseValue) ? baseValue : {}, currentValue);
      if (Object.keys(nested).length > 0) changed[key] = nested;
    } else if (!jsonValueEquals(baseValue, currentValue)) {
      changed[key] = cloneSafeJsonValue(currentValue);
    }
  }
  return changed;
}

/** Return only fields changed by this client; omitted fields are never deletions. */
export function diffCloudSafeSettings(
  base: CloudSafeSettings,
  current: CloudSafeSettings,
): CloudSafeSettings {
  return diffJsonObjects(base, current) as CloudSafeSettings;
}

export interface CloudSafeSettingsRebase {
  /** Server winner with this client's post-request edits replayed field by field. */
  settings: CloudSafeSettings;
  /** The exact client-owned delta replayed onto the server winner. */
  localChanges: CloudSafeSettings;
  hasLocalChanges: boolean;
}

/**
 * Three-way merge for an in-flight sync request. Changes are computed between
 * the local projection captured for the request and the latest live projection,
 * then replayed over the server-revision winner.
 */
export function rebaseCloudSafeSettings(
  serverWinner: CloudSafeSettings,
  localRequestBase: CloudSafeSettings,
  localCurrent: CloudSafeSettings,
): CloudSafeSettingsRebase {
  const localChanges = diffCloudSafeSettings(localRequestBase, localCurrent);
  return {
    settings: mergeCloudSafeSettings(serverWinner, localChanges),
    localChanges,
    hasLocalChanges: Object.keys(localChanges).length > 0,
  };
}

/**
 * Should a settings push happen? Two guards:
 *   1. `localDirtyMarker !== null` — null means this device has never
 *      changed a cloud-safe setting (factory defaults). A fresh device must
 *      NOT push defaults before pulling. The marker is never sent to the server;
 *      conflict resolution uses the last observed server revision.
 *   2. The current projection differs from what was last pushed — skip
 *      redundant POSTs on background sync cycles when nothing changed.
 */
export function shouldPushSettings(
  localDirtyMarker: string | null,
  currentSnapshotJson: string,
  lastPushedSnapshotJson: string,
): boolean {
  if (localDirtyMarker === null) return false;
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
