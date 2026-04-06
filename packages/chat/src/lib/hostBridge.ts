import { createContext, useContext } from 'react';
import type { Conversation } from './types';

export interface ChatHostConversation {
  id: string;
  title: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  pinned?: boolean;
  archived?: boolean;
  model?: string;
  provider?: string;
  messageCount?: number;
  lastMessage?: string;
}

export interface ChatHostSnapshot {
  activeConversationId: string | null;
  conversations: ChatHostConversation[];
}

export interface ChatHostBridge {
  getSnapshot: () => ChatHostSnapshot;
  subscribe?: (listener: () => void) => () => void;
  addMessage?: (message: { role: string; content: string; id?: string }) => string | void;
  createConversation?: (title?: string) => string;
  selectConversation?: (id: string | null) => void;
}

export const HostBridgeContext = createContext<ChatHostBridge | null>(null);

export function useHostBridge(): ChatHostBridge | null {
  return useContext(HostBridgeContext);
}

function toIsoString(value: string | Date | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeHostConversation(conversation: ChatHostConversation): Conversation {
  const now = new Date().toISOString();
  const createdAt =
    toIsoString(conversation.createdAt) ?? toIsoString(conversation.updatedAt) ?? now;
  const updatedAt = toIsoString(conversation.updatedAt) ?? createdAt;

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt,
    updatedAt,
    pinned: conversation.pinned ?? false,
    archived: conversation.archived ?? false,
    model: conversation.model,
    provider: conversation.provider,
    messageCount: conversation.messageCount,
    lastMessage: conversation.lastMessage,
  };
}
