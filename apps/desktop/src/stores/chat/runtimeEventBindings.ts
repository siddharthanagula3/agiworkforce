import { resolveActiveConversationMessageId } from '../../lib/runtimeMessageOwnership';
import { useUIStore as useSidecarStore } from '../ui';
import { useChatStore } from './chatStore';
import { useAgentStore, type ActionTrailEntry } from './agentStore';
import { useToolStore, type ActionLogEntry, type ApprovalRequest } from './toolStore';

export type ChatStateSnapshot = Pick<
  ReturnType<typeof useChatStore.getState>,
  'activeConversationId' | 'messagesByConversation' | 'messages' | 'currentStreamingMessageId'
>;

export type ActionTrailInput = Omit<ActionTrailEntry, 'id' | 'timestamp'>;
export type ActionLogInput = Omit<ActionLogEntry, 'createdAt' | 'updatedAt'>;
export type ApprovalRequestInput = Omit<ApprovalRequest, 'createdAt' | 'status'>;

function resolveActionTrailMessageId(chatState: ChatStateSnapshot): string | null {
  return resolveActiveConversationMessageId(chatState);
}

export function normalizeActionTrailEntry(
  entry: ActionTrailInput,
  chatState: ChatStateSnapshot,
): ActionTrailInput {
  const existingMessageId = entry.metadata?.['messageId'];
  if (typeof existingMessageId === 'string' && existingMessageId.length > 0) {
    return entry;
  }

  const targetMessageId = resolveActionTrailMessageId(chatState);
  if (!targetMessageId) {
    return entry;
  }

  return {
    ...entry,
    metadata: {
      ...(entry.metadata ?? {}),
      messageId: targetMessageId,
    },
  };
}

export function normalizeActionLogEntry(
  entry: ActionLogInput,
  chatState: ChatStateSnapshot,
  existingEntry?: ActionLogEntry,
): ActionLogInput {
  const existingMessageId = entry.metadata?.['messageId'] ?? existingEntry?.metadata?.['messageId'];
  if (typeof existingMessageId === 'string' && existingMessageId.length > 0) {
    return {
      ...entry,
      metadata: {
        ...(existingEntry?.metadata ?? {}),
        ...(entry.metadata ?? {}),
        messageId: existingMessageId,
      },
    };
  }

  const targetMessageId = resolveActionTrailMessageId(chatState);
  if (!targetMessageId) {
    return entry;
  }

  return {
    ...entry,
    metadata: {
      ...(existingEntry?.metadata ?? {}),
      ...(entry.metadata ?? {}),
      messageId: targetMessageId,
    },
  };
}

export function normalizeActionLogUpdates(
  updates: Partial<ActionLogEntry>,
  chatState: ChatStateSnapshot,
  existingEntry?: ActionLogEntry,
): Partial<ActionLogEntry> {
  const existingMessageId =
    updates.metadata?.['messageId'] ?? existingEntry?.metadata?.['messageId'];
  if (typeof existingMessageId === 'string' && existingMessageId.length > 0) {
    return {
      ...updates,
      metadata: {
        ...(existingEntry?.metadata ?? {}),
        ...(updates.metadata ?? {}),
        messageId: existingMessageId,
      },
    };
  }

  const targetMessageId = resolveActionTrailMessageId(chatState);
  if (!targetMessageId) {
    return updates;
  }

  return {
    ...updates,
    metadata: {
      ...(existingEntry?.metadata ?? {}),
      ...(updates.metadata ?? {}),
      messageId: targetMessageId,
    },
  };
}

export function normalizeApprovalRequest(
  request: ApprovalRequestInput,
  chatState: ChatStateSnapshot,
): ApprovalRequestInput {
  const existingMessageId =
    request.messageId ??
    (typeof request.details?.['messageId'] === 'string'
      ? (request.details['messageId'] as string)
      : undefined);

  if (existingMessageId && existingMessageId.length > 0) {
    return {
      ...request,
      messageId: existingMessageId,
      details: {
        ...(request.details ?? {}),
        messageId: existingMessageId,
      },
    };
  }

  const targetMessageId = resolveActionTrailMessageId(chatState);
  if (!targetMessageId) {
    return request;
  }

  return {
    ...request,
    messageId: targetMessageId,
    details: {
      ...(request.details ?? {}),
      messageId: targetMessageId,
    },
  };
}

export function addNormalizedActionTrailEntry(entry: ActionTrailInput): void {
  useAgentStore
    .getState()
    .addActionTrailEntry(normalizeActionTrailEntry(entry, useChatStore.getState()));
}

export function addNormalizedActionLogEntry(entry: ActionLogInput): void {
  useToolStore
    .getState()
    .addActionLogEntry(normalizeActionLogEntry(entry, useChatStore.getState()));
}

export function updateNormalizedActionLogEntry(id: string, updates: Partial<ActionLogEntry>): void {
  const existingEntry =
    useToolStore.getState().actionLog.find((item) => item.id === id || item.actionId === id) ??
    undefined;

  useToolStore
    .getState()
    .updateActionLogEntry(
      id,
      normalizeActionLogUpdates(updates, useChatStore.getState(), existingEntry),
    );
}

export function addNormalizedApprovalRequest(request: ApprovalRequestInput): void {
  useToolStore
    .getState()
    .addApprovalRequest(normalizeApprovalRequest(request, useChatStore.getState()));
}

export function focusSidecarSectionFromEvent(eventType: string): void {
  useSidecarStore.getState().setSidecarSectionFromEvent(eventType);
}
