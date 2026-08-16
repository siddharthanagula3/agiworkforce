
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

export function mergeCloudSafeSettings(
  base: CloudSafeSettings,
  overlay: CloudSafeSettings,
): CloudSafeSettings {
  return mergeJsonObjects(base, overlay) as CloudSafeSettings;
}

function diffJsonObjects(base: JsonObject, current: JsonObject): JsonObject {
  const changed: JsonObject = {};
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

export function diffCloudSafeSettings(
  base: CloudSafeSettings,
  current: CloudSafeSettings,
): CloudSafeSettings {
  return diffJsonObjects(base, current) as CloudSafeSettings;
}

export interface CloudSafeSettingsRebase {
  settings: CloudSafeSettings;
  localChanges: CloudSafeSettings;
  hasLocalChanges: boolean;
}

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

export function shouldPushSettings(
  localDirtyMarker: string | null,
  currentSnapshotJson: string,
  lastPushedSnapshotJson: string,
): boolean {
  if (localDirtyMarker === null) return false;
  return currentSnapshotJson !== lastPushedSnapshotJson;
}

export function shouldApplyPulledSettings(
  advancedCursor: string,
  previousCursor: string,
  pulledNamespaceCount: number,
): boolean {
  return advancedCursor !== previousCursor && pulledNamespaceCount > 0;
}
