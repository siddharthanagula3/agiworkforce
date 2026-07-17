/**
 * Conversation delta-apply — pure logic extracted from mobile's
 * cloudSyncEngine.ts (the reference implementation; see
 * apps/mobile/services/cloudSyncEngine.ts applyConversationDeltas, pre-Wave-4).
 *
 * Storage access goes through an injected `ConversationStorePort` so this
 * module has no Zustand / SQLite / IO dependency. Each surface's sync engine
 * supplies a thin adapter over its own local store:
 *   - mobile: apps/mobile/services/cloudSyncEngine.ts wraps
 *     chatCloudMessageStore (addCloudConversation / patchCloudConversation /
 *     removeCloudConversation).
 *   - desktop: apps/desktop/src-tauri/src/data/cloud_sync.rs re-implements
 *     the same rule natively against SQLite (apply_conversation_deltas) — it
 *     does NOT consume this module (Rust can't import TS) but is replayed
 *     against the same golden fixtures (see __fixtures__/conversation-apply.json
 *     and the Rust `#[cfg(test)]` module in cloud_sync.rs) to keep the two
 *     implementations provably in sync.
 */
import type { ConversationWireDelta } from '@agiworkforce/cloud-contracts';

/** The fields every surface's local conversation record needs for delta-sync apply. */
export interface SyncConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinned: boolean;
  model?: string;
  projectId?: string;
  /** Last server-owned revision observed for this record. Missing legacy state means `0`. */
  serverVersion?: string;
}

/**
 * Storage access a surface must provide to apply pulled conversation deltas.
 * Mirrors the operations mobile's chatCloudMessageStore already exposes.
 */
export interface ConversationStorePort {
  /** The current record for `id`, or undefined if not yet known locally. */
  get(id: string): SyncConversationRecord | undefined;
  /** Insert a brand-new conversation (id not previously known locally). */
  insert(record: SyncConversationRecord): void;
  /** Patch an existing conversation's fields in place (partial update). */
  patch(id: string, patch: Partial<SyncConversationRecord>): void;
  /** Remove a conversation from the local store entirely (tombstone). */
  remove(id: string): void;
}

/**
 * Apply pulled conversation deltas to `port`, in delta order (deltas arrive
 * ordered by `server_version asc` per the wire contract, so a later delta for
 * the same id naturally wins).
 *
 * `dirtyConversationIds` is the caller's current un-pushed mutation queue.
 * Preserve the complete local mutation while advancing its CAS base revision;
 * a remote tombstone remains authoritative.
 */
export function applyConversationDeltas(
  port: ConversationStorePort,
  deltas: ReadonlyArray<ConversationWireDelta>,
  dirtyConversationIds: ReadonlyArray<string>,
): void {
  for (const d of deltas) {
    if (d.deleted_at) {
      port.remove(d.id);
      continue;
    }
    const existing = port.get(d.id);
    const record: SyncConversationRecord = {
      id: d.id,
      title: d.title,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      messageCount: existing?.messageCount ?? 0,
      pinned: d.pinned,
      model: d.model ?? undefined,
      projectId: d.project_id ?? undefined,
      serverVersion: d.server_version,
    };
    if (dirtyConversationIds.includes(d.id)) {
      if (existing) {
        Object.assign(record, existing, { serverVersion: d.server_version });
      }
    }
    if (existing) {
      port.patch(d.id, record);
    } else {
      port.insert(record);
    }
  }
}

/** The camelCase wire shape POSTed to /api/chat/sync (matches the server's PushConversationSchema). */
export interface ConversationPushItem {
  id: string;
  title: string;
  model: string | null;
  projectId: string | null;
  pinned: boolean;
  baseVersion: string;
}

/**
 * Map a local record to the clock-free compare-and-swap wire shape.
 */
export function toConversationPushItem(record: SyncConversationRecord): ConversationPushItem {
  return {
    id: record.id,
    title: record.title,
    model: record.model ?? null,
    projectId: record.projectId ?? null,
    pinned: record.pinned ?? false,
    baseVersion: record.serverVersion ?? '0',
  };
}

/** Compare only mutation fields carried on the conversation sync wire. */
export function conversationSyncContentMatches(
  left: SyncConversationRecord,
  right: SyncConversationRecord,
): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    (left.model ?? null) === (right.model ?? null) &&
    (left.projectId ?? null) === (right.projectId ?? null) &&
    left.pinned === right.pinned
  );
}
