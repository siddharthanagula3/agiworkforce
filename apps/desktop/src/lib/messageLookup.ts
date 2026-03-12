import type { EnhancedMessage } from '../stores/chat/types';
import { getMergedMessageArtifacts } from './messageArtifacts';

type MessageGroups =
  | Record<string, EnhancedMessage[] | undefined>
  | Map<string, EnhancedMessage[]>
  | undefined;

export interface MessageLookupSnapshot {
  activeConversationId?: string | null;
  messages?: EnhancedMessage[];
  messagesByConversation?: MessageGroups;
}

export interface ArtifactOwnerResult {
  message: EnhancedMessage;
  artifacts: ReturnType<typeof getMergedMessageArtifacts>;
  artifactIndex: number;
}

function getConversationMessages(messagesByConversation: MessageGroups, conversationId: string): EnhancedMessage[] {
  if (messagesByConversation instanceof Map) {
    return messagesByConversation.get(conversationId) ?? [];
  }

  return messagesByConversation?.[conversationId] ?? [];
}

function getConversationEntries(messagesByConversation: MessageGroups): Array<[string, EnhancedMessage[]]> {
  if (messagesByConversation instanceof Map) {
    return Array.from(messagesByConversation.entries());
  }

  return Object.entries(messagesByConversation ?? {}).map(([id, messages]) => [id, messages ?? []]);
}

export function findMessageById(
  snapshot: MessageLookupSnapshot,
  messageId: string,
): EnhancedMessage | null {
  const directMessage = snapshot.messages?.find((message) => message.id === messageId);
  if (directMessage) {
    return directMessage;
  }

  for (const [, messages] of getConversationEntries(snapshot.messagesByConversation)) {
    const found = messages.find((message) => message.id === messageId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findMessageOwningArtifact(
  snapshot: MessageLookupSnapshot,
  artifactId: string,
): ArtifactOwnerResult | null {
  const visitedMessageIds = new Set<string>();
  const candidateGroups: EnhancedMessage[][] = [];

  if (snapshot.activeConversationId) {
    const activeMessages = getConversationMessages(
      snapshot.messagesByConversation,
      snapshot.activeConversationId,
    );
    if (activeMessages.length > 0) {
      candidateGroups.push(activeMessages);
    }
  }

  if (snapshot.messages && snapshot.messages.length > 0) {
    candidateGroups.push(snapshot.messages);
  }

  for (const [conversationId, messages] of getConversationEntries(snapshot.messagesByConversation)) {
    if (conversationId === snapshot.activeConversationId) {
      continue;
    }
    if (messages.length > 0) {
      candidateGroups.push(messages);
    }
  }

  for (const messages of candidateGroups) {
    for (const message of messages) {
      if (visitedMessageIds.has(message.id)) {
        continue;
      }
      visitedMessageIds.add(message.id);
      const artifacts = getMergedMessageArtifacts(message);
      const artifactIndex = artifacts.findIndex((artifact) => artifact.id === artifactId);
      if (artifactIndex >= 0) {
        return {
          message,
          artifacts,
          artifactIndex,
        };
      }
    }
  }

  return null;
}
