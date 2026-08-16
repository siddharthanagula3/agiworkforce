import type { ConversationStorePort, SyncConversationRecord } from '../conversations';
import type { MessageStorePort, SyncMessageRecord } from '../messages';

export interface TestConversationPort extends ConversationStorePort {
  list(): SyncConversationRecord[];
}

export function createInMemoryConversationPort(
  initial: ReadonlyArray<SyncConversationRecord> = [],
): TestConversationPort {
  const byId = new Map<string, SyncConversationRecord>(initial.map((c) => [c.id, { ...c }]));
  return {
    get: (id) => byId.get(id),
    insert: (record) => {
      byId.set(record.id, { ...record });
    },
    patch: (id, patch) => {
      const existing = byId.get(id);
      if (existing) byId.set(id, { ...existing, ...patch });
    },
    remove: (id) => {
      byId.delete(id);
    },
    list: () => Array.from(byId.values()),
  };
}

export interface TestMessagePort extends MessageStorePort {
  all(): Record<string, SyncMessageRecord[]>;
}

export function createInMemoryMessagePort(
  initial: Record<string, ReadonlyArray<SyncMessageRecord>> = {},
): TestMessagePort {
  const byConversation = new Map<string, SyncMessageRecord[]>(
    Object.entries(initial).map(([id, messages]) => [id, [...messages]]),
  );
  return {
    getMessages: (conversationId) => byConversation.get(conversationId) ?? [],
    setMessages: (conversationId, messages) => {
      byConversation.set(conversationId, [...messages]);
    },
    all: () => Object.fromEntries(byConversation.entries()),
  };
}
