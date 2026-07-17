import { logger } from '@shared/lib/logger';
// Chat persistence service - handles API operations for chat sessions and messages
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { ChatSession, ChatMessage } from '../types';
import {
  createManagedCloudChatClient,
  ManagedCloudChatHttpError,
  type ManagedCloudConversation,
  type ManagedCloudMessage,
} from '@agiworkforce/cloud-contracts';

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

const cloudClient = createManagedCloudChatClient({
  getAuthToken,
  decorateMutationHeaders: async (headers) => ({
    ...headers,
    'x-csrf-token': await getCsrfToken(),
  }),
  fetchImpl: (input, init) => fetch(input, init),
});

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapCloudConversationToSession(row: ManagedCloudConversation): ChatSession {
  const createdAt = new Date(row.createdAt);
  const updatedAt = new Date(row.updatedAt);
  return {
    id: row.id,
    title: row.title,
    createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
    updatedAt: isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
    messageCount: 0,
    tokenCount: 0,
    cost: 0,
    isPinned: row.pinned,
    isArchived: false,
    isStarred: false,
    tags: [],
    participants: [],
    metadata: { pinned: row.pinned },
  };
}

function mapCloudMessageToMessage(row: ManagedCloudMessage): ChatMessage {
  const createdAt = new Date(row.createdAt);
  return {
    id: row.id,
    sessionId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
    updatedAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
    edited: false,
    editCount: 0,
    ...(row.metadata && { metadata: row.metadata }),
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
    void metadata;
    return mapCloudConversationToSession(await cloudClient.createConversation({ title }));
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(_userId: string): Promise<ChatSession[]> {
    const page = await cloudClient.listConversations();
    return page.conversations.map(mapCloudConversationToSession);
  }

  /**
   * Get paginated sessions for a user with cursor-based pagination
   */
  async getUserSessionsPaginated(
    _userId: string,
    params: PaginationParams = {},
  ): Promise<PaginatedResponse<ChatSession>> {
    const limit = params.limit ?? 20;
    const offset = params.cursor ? Number.parseInt(params.cursor, 10) || 0 : 0;
    const page = await cloudClient.listConversations({ limit, offset });
    return {
      data: page.conversations.map(mapCloudConversationToSession),
      nextCursor: page.hasMore ? String(page.nextOffset) : null,
      hasMore: page.hasMore,
    };
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string, _userId?: string): Promise<ChatSession | null> {
    try {
      const detail = await cloudClient.getConversation(sessionId);
      return mapCloudConversationToSession(detail.conversation);
    } catch (error) {
      if (error instanceof ManagedCloudChatHttpError && [401, 403, 404].includes(error.status)) {
        logger.warn('Access denied to or missing session:', sessionId);
        return null;
      }
      throw error;
    }
  }

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string, _userId?: string): Promise<void> {
    await cloudClient.updateConversation(sessionId, { title });
  }

  /**
   * Delete (archive) a session
   */
  async deleteSession(sessionId: string, _userId?: string): Promise<void> {
    await cloudClient.deleteConversation(sessionId);
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
    const saved = await cloudClient.saveMessage(sessionId, { role, content, metadata });
    const now = new Date();
    return {
      id: saved.id,
      sessionId,
      role,
      content,
      createdAt: now,
      updatedAt: now,
      edited: false,
      editCount: 0,
      ...(metadata && { metadata }),
    };
  }

  /**
   * Get all messages for a session
   */
  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const detail = await cloudClient.getConversation(sessionId);
    return detail.messages.map(mapCloudMessageToMessage);
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
    const page = await cloudClient.listConversations({ q: query });
    return page.conversations.map(mapCloudConversationToSession);
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
    void sessionId;
    void isStarred;
    throw new Error('Conversation starring is not supported by the managed-cloud API');
  }

  /**
   * Update session pinned state
   */
  async updateSessionPinned(sessionId: string, isPinned: boolean, _userId?: string): Promise<void> {
    await cloudClient.updateConversation(sessionId, { pinned: isPinned });
  }

  /**
   * Update session archived state
   */
  async updateSessionArchived(
    sessionId: string,
    isArchived: boolean,
    _userId?: string,
  ): Promise<void> {
    void sessionId;
    void isArchived;
    throw new Error('Conversation archiving is not supported by the managed-cloud API');
  }

  /**
   * Update session shared link
   */
  async updateSessionSharedLink(
    sessionId: string,
    sharedLink: string | null,
    _userId?: string,
  ): Promise<void> {
    void sessionId;
    void sharedLink;
    throw new Error('Conversation shared links are not supported by the managed-cloud API');
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
