/**
 * Message Reactions Service
 * Handles CRUD operations for message reactions (emoji reactions on chat messages)
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import { logger } from '@shared/lib/logger';

/**
 * Standard emoji set for reactions
 */
export const REACTION_EMOJIS = [
  { emoji: '\u{1F44D}', label: 'Thumbs up' },
  { emoji: '\u{1F44E}', label: 'Thumbs down' },
  { emoji: '\u{2764}\u{FE0F}', label: 'Heart' },
  { emoji: '\u{1F604}', label: 'Smile' },
  { emoji: '\u{1F622}', label: 'Sad' },
  { emoji: '\u{1F389}', label: 'Celebrate' },
  { emoji: '\u{1F525}', label: 'Fire' },
  { emoji: '\u{1F440}', label: 'Eyes' },
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]['emoji'];

/**
 * Single reaction record from the database
 */
export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

/**
 * Aggregated reaction data for a message
 */
export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
  userReacted: boolean;
}

/**
 * All reactions for a message grouped by emoji
 */
export interface MessageReactionsSummary {
  messageId: string;
  reactions: ReactionSummary[];
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

class MessageReactionsService {
  /**
   * Add a reaction to a message
   */
  async addReaction(_userId: string, messageId: string, emoji: string): Promise<MessageReaction> {
    const result = await this.toggleReaction(_userId, messageId, emoji);
    if (!result.added || !result.reaction) {
      throw new Error('Reaction was removed instead of added, or no data returned');
    }
    return result.reaction;
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(_userId: string, messageId: string, emoji: string): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/reactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messageId, emoji }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Failed to remove reaction: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
    // Toggle semantics: if it was already present it will be removed
  }

  /**
   * Toggle a reaction on a message (add if not exists, remove if exists)
   * Returns true if reaction was added, false if removed
   */
  async toggleReaction(
    _userId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ added: boolean; reaction?: MessageReaction }> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/reactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messageId, emoji }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Reactions] Failed to toggle reaction:', err);
      throw new Error(
        `Failed to toggle reaction: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      added: boolean;
      reaction?: {
        id: string;
        messageId: string;
        userId: string;
        emoji: string;
        createdAt: string;
      } | null;
    };

    if (data.added && data.reaction) {
      return {
        added: true,
        reaction: {
          id: data.reaction.id,
          messageId: data.reaction.messageId,
          userId: data.reaction.userId,
          emoji: data.reaction.emoji,
          createdAt: new Date(data.reaction.createdAt),
        },
      };
    }

    return { added: false };
  }

  /**
   * Get all reactions for a single message
   */
  async getReactions(messageId: string): Promise<ReactionSummary[]> {
    const map = await this.getReactionsForMessages([messageId]);
    return map.get(messageId) ?? [];
  }

  /**
   * Get reactions for multiple messages (batch query for performance)
   */
  async getReactionsForMessages(messageIds: string[]): Promise<Map<string, ReactionSummary[]>> {
    if (messageIds.length === 0) {
      return new Map();
    }

    const headers = await buildReadHeaders();
    const res = await fetch(
      `/api/chat/reactions?messageIds=${encodeURIComponent(messageIds.join(','))}`,
      { headers },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[Reactions] Failed to get reactions for messages:', err);
      throw new Error(
        `Failed to get reactions: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      reactions: Record<
        string,
        Array<{ emoji: string; count: number; userIds: string[]; userReacted: boolean }>
      >;
    };

    const reactionsMap = new Map<string, ReactionSummary[]>();
    for (const [msgId, summaries] of Object.entries(data.reactions ?? {})) {
      reactionsMap.set(
        msgId,
        summaries.map((s) => ({
          emoji: s.emoji,
          count: s.count,
          userIds: s.userIds || [],
          userReacted: s.userReacted || false,
        })),
      );
    }

    return reactionsMap;
  }

  /**
   * Check if user has reacted to a message with a specific emoji
   */
  async hasUserReacted(_userId: string, messageId: string, emoji: string): Promise<boolean> {
    try {
      const reactions = await this.getReactions(messageId);
      const summary = reactions.find((r) => r.emoji === emoji);
      return summary?.userReacted ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Get all user's reactions for a message
   */
  async getUserReactionsForMessage(_userId: string, messageId: string): Promise<string[]> {
    try {
      const reactions = await this.getReactions(messageId);
      return reactions.filter((r) => r.userReacted).map((r) => r.emoji);
    } catch {
      return [];
    }
  }

  /**
   * Remove all reactions from a message (admin function)
   * No dedicated route exists; this method is not supported via API.
   */
  async clearMessageReactions(_messageId: string): Promise<void> {
    logger.warn('[Reactions] clearMessageReactions is not supported via the API');
    throw new Error('clearMessageReactions is not available in this context');
  }

  /**
   * Get reaction count for a message
   */
  async getReactionCount(messageId: string): Promise<number> {
    try {
      const reactions = await this.getReactions(messageId);
      return reactions.reduce((sum, r) => sum + r.count, 0);
    } catch {
      return 0;
    }
  }
}

export const messageReactionsService = new MessageReactionsService();
