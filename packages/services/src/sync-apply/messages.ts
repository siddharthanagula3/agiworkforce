/**
 * Message delta-apply — pure logic extracted from mobile's
 * cloudSyncEngine.ts (applyMessageDeltas, pre-Wave-4).
 *
 * ORPHAN-BUFFERING DIVERGENCE (intentional, not a gap):
 * desktop's SQLite mirror enforces a FOREIGN KEY from messages to
 * conversations, so a pulled message whose parent conversation hasn't landed
 * locally yet cannot be inserted — cloud_sync.rs buffers it in
 * `cloud_sync_pending_messages` and replays it once the parent arrives
 * (`buffer_pending_message` / `drain_pending_messages`). This port has NO
 * referential-integrity requirement: `setMessages` stores a message list
 * under whatever `conversationId` key it is given, independent of whether a
 * conversation record with that id exists elsewhere in the port. A message
 * pulled ahead of its parent conversation is therefore never lost on this
 * side — it is simply stored under that id and becomes visible the moment
 * the conversation itself is applied (same page or a later one). Buffering
 * exists ONLY to satisfy a storage constraint this port doesn't have, so it
 * is deliberately NOT ported here. See __fixtures__/message-apply.json's
 * "orphan_then_parent_arrives" case and the divergence ledger comment in
 * cloud_sync.rs's fixture-replay test module.
 */
import type { MessageWireDelta } from '../cloud-contracts/sync';

export type SyncMessageRole = 'user' | 'assistant' | 'system';

/**
 * The fields every surface's local message record needs for delta-sync
 * apply. `role` is intentionally `string`, not `SyncMessageRole`: a surface's
 * local store may hold non-syncable roles (e.g. mobile's 'tool' messages,
 * mirrored from a live agentic turn but never pushed/pulled — see push()'s
 * dead-ref handling in cloudSyncEngine.ts) that pass through this port
 * unchanged whenever they're not the target of a delta. Narrowing to
 * SyncMessageRole here would force adapters to lie about a value they must
 * carry through as-is. Every VALUE this module itself writes still comes
 * from `MessageWireDelta.role`, which IS the strict union at the schema
 * level (see isSyncableMessageRole for the push-side narrowing).
 */
export interface SyncMessageRecord {
  id: string;
  role: string;
  content: string;
  model?: string;
  provider?: string;
  createdAt?: string;
}

/**
 * Storage access a surface must provide to apply pulled message deltas.
 * Mirrors mobile's chatCloudMessageStore.setCloudMessages: messages are
 * stored per-conversation and always replaced as a whole ordered list.
 */
export interface MessageStorePort {
  /** All current messages for `conversationId`, in any order. */
  getMessages(conversationId: string): ReadonlyArray<SyncMessageRecord>;
  /** Replace the full message list for `conversationId` with an already-ordered list. */
  setMessages(conversationId: string, messages: ReadonlyArray<SyncMessageRecord>): void;
}

/** True for the three transcript roles that sync; a wire 'tool' row is unreachable (schema-level enum), other client-local roles are not synced. */
export function isSyncableMessageRole(role: string): role is SyncMessageRole {
  return role === 'user' || role === 'assistant' || role === 'system';
}

/**
 * Apply pulled message deltas to `port`, grouped by conversation so each
 * conversation's message list is read, merged, and written exactly once.
 */
export function applyMessageDeltas(
  port: MessageStorePort,
  deltas: ReadonlyArray<MessageWireDelta>,
): void {
  const byConversation = new Map<string, MessageWireDelta[]>();
  for (const d of deltas) {
    const list = byConversation.get(d.conversation_id) ?? [];
    list.push(d);
    byConversation.set(d.conversation_id, list);
  }

  for (const [conversationId, conversationDeltas] of byConversation) {
    const current = port.getMessages(conversationId);
    const merged = new Map<string, SyncMessageRecord>(current.map((m) => [m.id, m]));
    for (const d of conversationDeltas) {
      if (d.deleted_at) {
        merged.delete(d.id);
        continue;
      }
      const existing = merged.get(d.id);
      merged.set(d.id, {
        ...(existing ?? {}),
        id: d.id,
        role: d.role,
        content: d.content,
        ...(d.model ? { model: d.model } : {}),
        ...(d.provider ? { provider: d.provider } : {}),
        createdAt: d.created_at,
      });
    }
    const ordered = Array.from(merged.values()).sort((a, b) => {
      const at = a.createdAt ?? '';
      const bt = b.createdAt ?? '';
      return at === bt ? a.id.localeCompare(b.id) : at.localeCompare(bt);
    });
    port.setMessages(conversationId, ordered);
  }
}

/** The camelCase wire shape POSTed to /api/chat/sync (matches the server's PushMessageSchema). */
export interface MessagePushItem {
  id: string;
  conversationId: string;
  role: SyncMessageRole;
  content: string;
  model: string | null;
  provider: string | null;
  createdAt?: string;
}

/**
 * Map a local record to the push wire shape. Takes a record whose `role` is
 * already narrowed to `SyncMessageRole` — call `isSyncableMessageRole` first
 * (or filter with it) so a non-syncable role (e.g. 'tool') can never reach
 * the wire; this function does not re-check.
 */
export function toMessagePushItem(
  conversationId: string,
  record: Omit<SyncMessageRecord, 'role'> & { role: SyncMessageRole },
): MessagePushItem {
  return {
    id: record.id,
    conversationId,
    role: record.role,
    content: record.content,
    model: record.model ?? null,
    provider: record.provider ?? null,
    createdAt: record.createdAt,
  };
}
