import { logger } from '@shared/lib/logger';
// Chat persistence service - handles API operations for chat sessions and messages
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { ChatSession, ChatMessage } from '../types';

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  limit?: number;
  cursor?: string | null;
}

/**
 * Paginated response structure with cursor-based pagination
 */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

// ---------------------------------------------------------------------------
// Wire-format row types returned by the API routes
// ---------------------------------------------------------------------------

interface APIConversationRow {
  id: string;
  title: string | null;
  model?: string | null;
  created_at: string;
  updated_at: string;
  // Fields present on the full /[id] response but not the list response:
  user_id?: string;
  is_active?: boolean | null;
  is_starred?: boolean | null;
  is_pinned?: boolean | null;
  is_archived?: boolean | null;
  shared_link?: string | null;
  metadata?: unknown;
  last_message_at?: string | null;
  folder_id?: string | null;
  deleted_at?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  token_count?: number | null;
  cost_cents?: number | null;
}

interface APIMessageRow {
  id: string;
  role: string;
  content: string;
  model?: string | null;
  provider?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_cents?: number | null;
  created_at: string;
  updated_at?: string | null;
  edited?: boolean | null;
  edit_count?: number | null;
  metadata?: Record<string, unknown> | null;
  conversation_id?: string;
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

async function buildMutateHeaders(): Promise<HeadersInit> {
  const [token, csrf] = await Promise.all([getAuthToken(), getCsrfToken()]);
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': csrf,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function buildReadHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapAPIConversationToSession(
  row: APIConversationRow,
  conversationId?: string,
): ChatSession {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();

  const metadataObj = (
    typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {}
  ) as Record<string, unknown>;
  const metadataTags = (metadataObj['tags'] as string[]) || row.tags || [];

  return {
    id: conversationId ?? row.id,
    title: row.title || 'New Chat',
    createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
    updatedAt: isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
    messageCount: 0,
    tokenCount: row.token_count ?? 0,
    cost: row.cost_cents ? row.cost_cents / 100 : 0,
    isPinned: row.is_pinned ?? false,
    isArchived: row.is_archived ?? row.is_active === false,
    isStarred: row.is_starred ?? false,
    sharedLink: row.shared_link || undefined,
    tags: metadataTags,
    participants: row.user_id ? [row.user_id] : [],
    metadata: {
      role: metadataObj['role'] as string | undefined,
      provider: metadataObj['provider'] as string | undefined,
      starred: row.is_starred ?? false,
      pinned: row.is_pinned ?? false,
      archived: row.is_archived ?? false,
      tags: metadataTags,
      ...metadataObj,
    },
  };
}

function mapAPIMessageToMessage(row: APIMessageRow, sessionId: string): ChatMessage {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;

  const rawMetadata = row.metadata;
  const metadata =
    rawMetadata && typeof rawMetadata === 'object' && Object.keys(rawMetadata).length > 0
      ? rawMetadata
      : undefined;

  return {
    id: row.id,
    sessionId: row.conversation_id ?? sessionId,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
    updatedAt: isNaN(updatedAt.getTime()) ? createdAt : updatedAt,
    edited: row.edited ?? false,
    editCount: row.edit_count ?? 0,
    ...(metadata && { metadata }),
  };
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class ChatPersistenceService {
  /**
   * Create a new chat session
   */
  async createSession(
    _userId: string,
    title: string,
    metadata?: {
      employeeId?: string;
      role?: string;
      provider?: string;
    },
  ): Promise<ChatSession> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, metadata }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to create session: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { conversation: APIConversationRow };
    if (!data.conversation) throw new Error('Failed to create session: No data returned');

    return mapAPIConversationToSession(data.conversation);
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(_userId: string): Promise<ChatSession[]> {
    const headers = await buildReadHeaders();
    const res = await fetch('/api/chat/conversations', { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to load sessions: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { conversations: APIConversationRow[] };
    return (data.conversations || []).map((c) => mapAPIConversationToSession(c));
  }

  /**
   * Get paginated sessions for a user with cursor-based pagination
   */
  async getUserSessionsPaginated(
    _userId: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResponse<ChatSession>> {
    const { limit = 20, cursor } = params;
    const qp = new URLSearchParams({ limit: String(limit) });
    if (cursor) qp.set('cursor', cursor);

    const headers = await buildReadHeaders();
    const res = await fetch(`/api/chat/conversations?${qp.toString()}`, { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to load sessions: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { conversations: APIConversationRow[] };
    const items = data.conversations || [];
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const sessions = resultItems.map((c) => mapAPIConversationToSession(c));

    const lastItem = resultItems[resultItems.length - 1];
    const nextCursor = hasMore && lastItem ? (lastItem.updated_at ?? null) : null;

    return { data: sessions, nextCursor, hasMore };
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string, _userId?: string): Promise<ChatSession | null> {
    const headers = await buildReadHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      headers,
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        logger.warn('Access denied to session:', sessionId);
        return null;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to load session: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { conversation: APIConversationRow };
    if (!data.conversation) return null;

    return mapAPIConversationToSession(data.conversation, sessionId);
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string, _userId?: string): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ title }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('You do not have permission to update this session');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to update session: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Delete (archive) a session
   */
  async deleteSession(sessionId: string, _userId?: string): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('You do not have permission to delete this session');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to delete session: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Save a message to the database (skipLlm=true so only the message is stored)
   */
  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChatMessage> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ role, content, skipLlm: true, metadata }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to save message: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { message: APIMessageRow };
    if (!data.message) throw new Error('Failed to save message: No data returned');

    return mapAPIMessageToMessage(data.message, sessionId);
  }

  /**
   * Get all messages for a session
   */
  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const headers = await buildReadHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      headers,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        logger.warn('Access denied to messages for session:', sessionId);
        return [];
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to load messages: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      conversation: APIConversationRow;
      messages: APIMessageRow[];
    };

    return (data.messages || []).map((m) => mapAPIMessageToMessage(m, sessionId));
  }

  /**
   * Get paginated messages for a session with cursor-based pagination
   */
  async getSessionMessagesPaginated(
    sessionId: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResponse<ChatMessage>> {
    // The conversations/[id] route returns all messages; paginate client-side
    const allMessages = await this.getSessionMessages(sessionId);
    const { limit = 50, cursor } = params;

    let startIdx = 0;
    if (cursor) {
      const idx = allMessages.findIndex((m) => new Date(m.createdAt).toISOString() > cursor);
      startIdx = idx === -1 ? allMessages.length : idx;
    }

    const slice = allMessages.slice(startIdx, startIdx + limit + 1);
    const hasMore = slice.length > limit;
    const resultItems = hasMore ? slice.slice(0, limit) : slice;
    const lastItem = resultItems[resultItems.length - 1];
    const nextCursor = hasMore && lastItem ? new Date(lastItem.createdAt).toISOString() : null;

    return {
      data: resultItems,
      nextCursor,
      hasMore,
      total: allMessages.length,
    };
  }

  /**
   * Get messages before a specific cursor (for loading older messages)
   */
  async getSessionMessagesBeforeCursor(
    sessionId: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResponse<ChatMessage>> {
    const allMessages = await this.getSessionMessages(sessionId);
    const { limit = 50, cursor } = params;

    let endIdx = allMessages.length;
    if (cursor) {
      const idx = allMessages.findIndex((m) => new Date(m.createdAt).toISOString() >= cursor);
      endIdx = idx === -1 ? allMessages.length : idx;
    }

    const startIdx = Math.max(0, endIdx - (limit + 1));
    const slice = allMessages.slice(startIdx, endIdx);
    const hasMore = slice.length > limit;
    const resultItems = hasMore ? slice.slice(1) : slice;
    const oldestItem = resultItems[0];
    const nextCursor = hasMore && oldestItem ? new Date(oldestItem.createdAt).toISOString() : null;

    return {
      data: resultItems,
      nextCursor,
      hasMore,
      total: allMessages.length,
    };
  }

  /**
   * Update a message's content
   * The /api/chat/conversations/[id]/messages/[messageId] route only supports
   * PATCH for metadata (reaction). Full content update has no route yet.
   */
  async updateMessage(messageId: string, _newContent: string): Promise<ChatMessage> {
    throw new Error(
      `updateMessage (id: ${messageId}) is not supported via the API · no content-update route exists`,
    );
  }

  /**
   * Get edit history for a message
   * No route exists for this operation.
   */
  async getMessageEditHistory(
    _messageId: string,
  ): Promise<Array<{ id: string; previousContent: string; editedAt: Date }>> {
    logger.warn('[ChatPersistence] getMessageEditHistory has no API route');
    return [];
  }

  /**
   * Delete a message
   * No route exists for this operation.
   */
  async deleteMessage(_messageId: string): Promise<void> {
    throw new Error('deleteMessage is not supported via the API · no delete-message route exists');
  }

  /**
   * Get message count for a session
   */
  async getMessageCount(sessionId: string): Promise<number> {
    try {
      const messages = await this.getSessionMessages(sessionId);
      return messages.length;
    } catch {
      throw new Error(`Failed to count messages for session: ${sessionId}`);
    }
  }

  /**
   * Search sessions by title
   */
  async searchSessions(_userId: string, query: string): Promise<ChatSession[]> {
    const headers = await buildReadHeaders();
    const res = await fetch(`/api/chat/conversations?q=${encodeURIComponent(query)}`, { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to search sessions: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { conversations: APIConversationRow[] };
    return (data.conversations || []).map((c) => mapAPIConversationToSession(c));
  }

  /**
   * Update session starred state
   * No dedicated route; uses PUT /[id] with is_starred field.
   */
  async updateSessionStarred(
    sessionId: string,
    isStarred: boolean,
    _userId?: string,
  ): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ is_starred: isStarred }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('You do not have permission to update this session');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to update starred state: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Update session pinned state
   */
  async updateSessionPinned(sessionId: string, isPinned: boolean, _userId?: string): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ is_pinned: isPinned }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('You do not have permission to update this session');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to update pinned state: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Update session archived state
   */
  async updateSessionArchived(
    sessionId: string,
    isArchived: boolean,
    _userId?: string,
  ): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ is_archived: isArchived }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('You do not have permission to update this session');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to update archived state: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Update session shared link
   */
  async updateSessionSharedLink(
    sessionId: string,
    sharedLink: string | null,
    _userId?: string,
  ): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ shared_link: sharedLink }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('You do not have permission to update this session');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to update shared link: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Copy messages from one session to another
   * No dedicated route; copies message-by-message via saveMessage.
   */
  async copySessionMessages(
    sourceSessionId: string,
    targetSessionId: string,
    _userId?: string,
  ): Promise<void> {
    const sourceMessages = await this.getSessionMessages(sourceSessionId);

    for (const msg of sourceMessages) {
      await this.saveMessage(
        targetSessionId,
        msg.role as 'user' | 'assistant' | 'system',
        msg.content,
      );
    }
  }
}

export const chatPersistenceService = new ChatPersistenceService();
