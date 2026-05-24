import { logger } from '@shared/lib/logger';
/**
 * Message Bookmarks Service
 * Handles CRUD operations for bookmarking chat messages
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';

export interface MessageBookmark {
  id: string;
  userId: string;
  sessionId: string;
  messageId: string;
  note?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BookmarkedMessage extends MessageBookmark {
  messageRole: 'user' | 'assistant' | 'system';
  messageContent: string;
  messageCreatedAt: Date;
  sessionTitle: string;
  sessionCreatedAt: Date;
}

interface APIBookmarkedMessageRow {
  id: string | null;
  user_id: string | null;
  session_id: string | null;
  message_id: string | null;
  note: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  bookmark_note: string | null;
  bookmark_tags: string[] | null;
  bookmarked_at: string | null;
  message_role: string | null;
  message_content: string | null;
  message_created_at: string | null;
  session_title: string | null;
  session_created_at: string | null;
}

interface APIBookmarkRow {
  id: string;
  user_id: string;
  session_id: string;
  message_id: string;
  note: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

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

function mapRowToBookmarkedMessage(row: APIBookmarkedMessageRow): BookmarkedMessage {
  return {
    id: row.id ?? '',
    userId: row.user_id ?? '',
    sessionId: row.session_id ?? '',
    messageId: row.message_id ?? '',
    note: row.bookmark_note ?? undefined,
    tags: row.bookmark_tags || [],
    createdAt: new Date(row.bookmarked_at ?? Date.now()),
    updatedAt: new Date(row.bookmarked_at ?? Date.now()),
    messageRole: (row.message_role as 'user' | 'assistant' | 'system') ?? 'user',
    messageContent: row.message_content ?? '',
    messageCreatedAt: new Date(row.message_created_at ?? Date.now()),
    sessionTitle: row.session_title ?? 'Untitled',
    sessionCreatedAt: new Date(row.session_created_at ?? Date.now()),
  };
}

function mapRowToBookmark(row: APIBookmarkRow): MessageBookmark {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    note: row.note ?? undefined,
    tags: row.tags || [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class MessageBookmarksService {
  /**
   * Check if a message is bookmarked
   */
  async isBookmarked(_userId: string, messageId: string): Promise<boolean> {
    try {
      const headers = await buildReadHeaders();
      const res = await fetch(`/api/chat/bookmarks?messageId=${encodeURIComponent(messageId)}`, {
        headers,
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { bookmarks: APIBookmarkedMessageRow[] };
      return (data.bookmarks ?? []).some((b) => b.message_id === messageId);
    } catch {
      logger.error('[Bookmarks] Failed to check bookmark');
      return false;
    }
  }

  /**
   * Add a bookmark
   */
  async addBookmark(
    _userId: string,
    sessionId: string,
    messageId: string,
    options?: { note?: string; tags?: string[] },
  ): Promise<MessageBookmark> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/bookmarks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId,
        messageId,
        note: options?.note,
        tags: options?.tags || [],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Bookmarks] Failed to add bookmark:', err);
      throw new Error(
        `Failed to add bookmark: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { bookmark: APIBookmarkRow };
    if (!data.bookmark) {
      throw new Error('Failed to add bookmark: No data returned');
    }

    return mapRowToBookmark(data.bookmark);
  }

  /**
   * Remove a bookmark
   */
  async removeBookmark(_userId: string, messageId: string): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/bookmarks', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ messageId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Bookmarks] Failed to remove bookmark:', err);
      throw new Error(
        `Failed to remove bookmark: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Update bookmark note/tags
   */
  async updateBookmark(
    _userId: string,
    messageId: string,
    updates: { note?: string; tags?: string[] },
  ): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/bookmarks', {
      method: 'POST',
      headers,
      // POST with existing messageId triggers an update in the route
      body: JSON.stringify({
        messageId,
        note: updates.note,
        tags: updates.tags,
        // sessionId is required by schema but we pass a placeholder since this is an update
        sessionId: '00000000-0000-0000-0000-000000000000',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Bookmarks] Failed to update bookmark:', err);
      throw new Error(
        `Failed to update bookmark: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Get all bookmarks for a user
   */
  async getUserBookmarks(_userId: string): Promise<BookmarkedMessage[]> {
    const headers = await buildReadHeaders();
    const res = await fetch('/api/chat/bookmarks', { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Bookmarks] Failed to get bookmarks:', err);
      throw new Error(
        `Failed to get bookmarks: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { bookmarks: APIBookmarkedMessageRow[] };
    return (data.bookmarks || []).map(mapRowToBookmarkedMessage);
  }

  /**
   * Get bookmarks for a specific session
   */
  async getSessionBookmarks(_userId: string, sessionId: string): Promise<BookmarkedMessage[]> {
    const headers = await buildReadHeaders();
    const res = await fetch(`/api/chat/bookmarks?sessionId=${encodeURIComponent(sessionId)}`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Bookmarks] Failed to get session bookmarks:', err);
      throw new Error(
        `Failed to get session bookmarks: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { bookmarks: APIBookmarkedMessageRow[] };
    return (data.bookmarks || []).map(mapRowToBookmarkedMessage);
  }

  /**
   * Search bookmarks by content or note
   * Note: The API does not expose a dedicated search endpoint; falls back to fetching all.
   */
  async searchBookmarks(_userId: string, query: string): Promise<BookmarkedMessage[]> {
    const all = await this.getUserBookmarks(_userId);
    const lowerQuery = query.toLowerCase();
    return all.filter(
      (b) =>
        b.messageContent.toLowerCase().includes(lowerQuery) ||
        (b.note ?? '').toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Get bookmark count for user
   */
  async getBookmarkCount(_userId: string): Promise<number> {
    try {
      const bookmarks = await this.getUserBookmarks(_userId);
      return bookmarks.length;
    } catch {
      logger.error('[Bookmarks] Failed to count bookmarks');
      return 0;
    }
  }

  /**
   * Get bookmarks by tag
   */
  async getBookmarksByTag(_userId: string, tag: string): Promise<BookmarkedMessage[]> {
    const all = await this.getUserBookmarks(_userId);
    return all.filter((b) => b.tags.includes(tag));
  }

  /**
   * Get all unique tags for user's bookmarks
   */
  async getUserBookmarkTags(_userId: string): Promise<string[]> {
    try {
      const bookmarks = await this.getUserBookmarks(_userId);
      const allTags = new Set<string>();
      bookmarks.forEach((b) => b.tags.forEach((t) => allTags.add(t)));
      return Array.from(allTags).sort();
    } catch {
      logger.error('[Bookmarks] Failed to get tags');
      return [];
    }
  }
}

export const messageBookmarksService = new MessageBookmarksService();
