import { createContext, useContext } from 'react';
import type { ChatExecutionMode } from '@agiworkforce/types';
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
  /** Immutable trust boundary for this conversation. */
  executionMode?: ChatExecutionMode;
}

export interface ChatHostSnapshot {
  activeConversationId: string | null;
  conversations: ChatHostConversation[];
}

export interface ChatHostCodingCheckpoint {
  id: string;
  toolName: string;
  filePath?: string;
  createdAtMs: number;
  description?: string;
}

export interface ChatHostBridge {
  getSnapshot: () => ChatHostSnapshot;
  subscribe?: (listener: () => void) => () => void;
  addMessage?: (message: { role: string; content: string; id?: string }) => string | void;
  createConversation?: (title?: string) => string;
  selectConversation?: (id: string | null) => void;
  /** Persist a per-conversation model preference in the host-owned store. */
  setConversationModel?: (id: string, modelId: string | null) => void;
  /**
   * Fetch a managed-cloud generated file's bytes with the host's auth
   * (desktop Tauri: guarded fetch + Bearer JWT; embedded web build omits it
   * and the shared UI falls back to a same-origin cookie fetch). Must reject
   * on non-2xx so the UI can show an honest failure state. Cloud mode only —
   * hosts must never route Local-mode content through this.
   */
  fetchCloudFile?: (uri: string) => Promise<Blob>;
  /**
   * Open the host's real upgrade/checkout surface for `requiredTier`.
   *
   * Backs the upgrade CTA on an in-transcript managed quota refusal (see
   * `MessageLimitCard`). Hosts without a checkout path omit it and the CTA is
   * NOT rendered — a button that leads nowhere is a dead control, and the card
   * still explains the ceiling and any reset time without it.
   */
  openUpgrade?: (requiredTier: string) => void;
  /** Live host checkpoint transport used by the shared rewind timeline. */
  fetchCodingCheckpoints?: () => Promise<ChatHostCodingCheckpoint[]>;
  /** Restore the workspace to a host checkpoint; rejects on failure. */
  rewindCodingCheckpoint?: (checkpointId: string) => Promise<void>;
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
    executionMode: conversation.executionMode,
  };
}
