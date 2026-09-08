import type { ConversationWireDelta } from '@agiworkforce/cloud-contracts';

export interface SyncConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinned: boolean;
  model?: string;
  projectId?: string;
  activeLeafMessageId?: string | null;
  serverVersion?: string;
}

export interface ConversationStorePort {
  get(id: string): SyncConversationRecord | undefined;
  insert(record: SyncConversationRecord): void;
  patch(id: string, patch: Partial<SyncConversationRecord>): void;
  remove(id: string): void;
}

type LocallyOwnedConversationFields = Pick<
  SyncConversationRecord,
  'title' | 'model' | 'projectId' | 'pinned'
>;

function locallyOwnedFields(record: SyncConversationRecord): LocallyOwnedConversationFields {
  const pushed = toConversationPushItem(record);
  return {
    title: pushed.title,
    model: pushed.model ?? undefined,
    projectId: pushed.projectId ?? undefined,
    pinned: pushed.pinned,
  };
}

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
    const branchPointer =
      d.active_leaf_message_id !== undefined
        ? { activeLeafMessageId: d.active_leaf_message_id }
        : {};
    const record: SyncConversationRecord = {
      id: d.id,
      title: d.title,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      messageCount: existing?.messageCount ?? 0,
      pinned: d.pinned,
      model: d.model ?? undefined,
      projectId: d.project_id ?? undefined,
      ...branchPointer,
      serverVersion: d.server_version,
    };
    if (existing && dirtyConversationIds.includes(d.id)) {
      // Dirty preservation covers local edits awaiting a push, and a push
      // carries exactly the fields `toConversationPushItem` names. Copying the
      // whole local record over the delta instead froze the fields no push can
      // send -- the timestamps, the message count, the branch pointer and the
      // CAS base -- so one unsent rename discarded every concurrent remote edit
      // to that conversation, including the `updatedAt` the sidebar orders by.
      Object.assign(record, locallyOwnedFields(existing));
    }
    if (existing) {
      port.patch(d.id, record);
    } else {
      port.insert(record);
    }
  }
}

export interface ConversationPushItem {
  id: string;
  title: string;
  model: string | null;
  projectId: string | null;
  pinned: boolean;
  baseVersion: string;
}

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
