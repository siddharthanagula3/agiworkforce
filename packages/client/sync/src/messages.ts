import type { MessageWireDelta } from '@agiworkforce/cloud-contracts';

export type SyncMessageRole = 'user' | 'assistant' | 'system';

export interface SyncMessageRecord {
  id: string;
  role: string;
  content: string;
  model?: string;
  provider?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
  serverVersion?: string;
}

export interface MessageStorePort {
  getMessages(conversationId: string): ReadonlyArray<SyncMessageRecord>;
  setMessages(conversationId: string, messages: ReadonlyArray<SyncMessageRecord>): void;
}

export function isSyncableMessageRole(role: string): role is SyncMessageRole {
  return role === 'user' || role === 'assistant' || role === 'system';
}

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
        metadata: d.metadata,
        serverVersion: d.server_version,
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

export interface MessagePushItem {
  id: string;
  conversationId: string;
  role: SyncMessageRole;
  content: string;
  model: string | null;
  provider: string | null;
  metadata: Record<string, unknown> | null;
  baseVersion: string;
}

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
    metadata: record.metadata ?? null,
    baseVersion: record.serverVersion ?? '0',
  };
}

function stableJsonStringify(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, nested) => {
    if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) {
      return nested;
    }
    return Object.keys(nested as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((ordered, key) => {
        ordered[key] = (nested as Record<string, unknown>)[key];
        return ordered;
      }, {});
  });
}

export function messageSyncContentMatches(
  sent: SyncMessageRecord,
  latest: SyncMessageRecord,
): boolean {
  return (
    sent.id === latest.id &&
    sent.role === latest.role &&
    sent.content === latest.content &&
    (sent.model ?? null) === (latest.model ?? null) &&
    (sent.provider ?? null) === (latest.provider ?? null) &&
    stableJsonStringify(sent.metadata ?? null) === stableJsonStringify(latest.metadata ?? null)
  );
}
