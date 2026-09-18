import { bigintGreater } from './cursor';

/**
 * What the user allows memory to do, which is not the same object as the
 * memories. A memory entry is content; a control is a consent decision, and
 * losing one to a stale device collects what the user switched off. So the
 * controls sync on their own path and resolve restrictively, not last-writer.
 */
export interface SyncMemoryControls {
  enabled: boolean;
  referenceChatHistory: boolean;
  /** Category ids the user switched off. Ids come from the shared memory catalogue. */
  disabledCategories: readonly string[];
  /** Null is keep indefinitely; a number is the shorter promise. */
  retentionDays: number | null;
  updatedAt: string;
  serverVersion: string;
}

export interface MemoryControlsWireDelta {
  enabled: boolean;
  reference_chat_history: boolean;
  disabled_categories: readonly string[];
  retention_days: number | null;
  updated_at: string;
  server_version: string;
}

export function mapMemoryControlsWireDelta(delta: MemoryControlsWireDelta): SyncMemoryControls {
  return {
    enabled: delta.enabled,
    referenceChatHistory: delta.reference_chat_history,
    disabledCategories: [...delta.disabled_categories].sort(),
    retentionDays: delta.retention_days,
    updatedAt: delta.updated_at,
    serverVersion: delta.server_version,
  };
}

function shorterRetention(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

/**
 * The restrictive side of every field wins, and the newer server version is
 * kept so the next push still carries a valid CAS base.
 */
export function mergeMemoryControls(
  server: SyncMemoryControls,
  local: SyncMemoryControls,
): SyncMemoryControls {
  const newer = bigintGreater(local.serverVersion, server.serverVersion) ? local : server;
  return {
    enabled: server.enabled && local.enabled,
    referenceChatHistory: server.referenceChatHistory && local.referenceChatHistory,
    disabledCategories: [
      ...new Set([...server.disabledCategories, ...local.disabledCategories]),
    ].sort(),
    retentionDays: shorterRetention(server.retentionDays, local.retentionDays),
    updatedAt: newer.updatedAt,
    serverVersion: newer.serverVersion,
  };
}

export function memoryControlsAllowCategory(
  controls: SyncMemoryControls,
  categoryId: string,
): boolean {
  return controls.enabled && !controls.disabledCategories.includes(categoryId);
}

export function memoryControlsMatch(left: SyncMemoryControls, right: SyncMemoryControls): boolean {
  return (
    left.enabled === right.enabled &&
    left.referenceChatHistory === right.referenceChatHistory &&
    left.retentionDays === right.retentionDays &&
    left.disabledCategories.length === right.disabledCategories.length &&
    left.disabledCategories.every((category, index) => category === right.disabledCategories[index])
  );
}

export interface MemoryControlsPushItem {
  enabled: boolean;
  referenceChatHistory: boolean;
  disabledCategories: readonly string[];
  retentionDays: number | null;
  baseVersion: string;
}

export function toMemoryControlsPushItem(controls: SyncMemoryControls): MemoryControlsPushItem {
  return {
    enabled: controls.enabled,
    referenceChatHistory: controls.referenceChatHistory,
    disabledCategories: controls.disabledCategories,
    retentionDays: controls.retentionDays,
    baseVersion: controls.serverVersion,
  };
}

/**
 * A pulled delta older than what the device already has is dropped; anything
 * else merges, so a device that switched memory off keeps it off even when the
 * server still believes it is on.
 */
export function applyMemoryControlsDelta(
  current: SyncMemoryControls | null,
  delta: SyncMemoryControls,
): SyncMemoryControls {
  if (current === null) return delta;
  if (bigintGreater(current.serverVersion, delta.serverVersion)) return current;
  return mergeMemoryControls(delta, current);
}

export function shouldPushMemoryControls(
  current: SyncMemoryControls,
  lastPushed: SyncMemoryControls | null,
): boolean {
  return lastPushed === null || !memoryControlsMatch(current, lastPushed);
}
