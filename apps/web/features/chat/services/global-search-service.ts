import { logger } from '@shared/lib/logger';
/**
 * Global Search Service
 * Searches across all chat sessions and messages with advanced filtering
 * Includes search history tracking and analytics
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';

export interface SearchResult {
  type: 'session' | 'message';
  sessionId: string;
  sessionTitle: string;
  messageId?: string;
  content: string;
  role?: 'user' | 'assistant' | 'system';
  createdAt: Date;
  updatedAt: Date;
  matchedText: string; // The text that matched the search
  contextBefore?: string; // Text before the match for context
  contextAfter?: string; // Text after the match for context
}

export interface SearchFilters {
  query: string;
  sessionIds?: string[]; // Filter by specific sessions
  startDate?: Date; // Filter messages after this date
  endDate?: Date; // Filter messages before this date
  role?: 'user' | 'assistant' | 'system'; // Filter by message role
  includeArchived?: boolean; // Include archived sessions
  limit?: number; // Max results (default: 50)
}

export interface SearchStats {
  totalResults: number;
  sessionMatches: number;
  messageMatches: number;
  searchTime: number; // in milliseconds
}

export interface RecentSearch {
  query: string;
  resultCount: number;
  createdAt: Date;
}

export interface PopularSearch {
  query: string;
  searchCount: number;
  avgResults: number;
}

export interface SearchSuggestion {
  suggestion: string;
  source: 'recent' | 'popular';
  score: number;
}

interface APISearchResult {
  type: 'session' | 'message';
  sessionId: string;
  sessionTitle: string;
  messageId?: string;
  content: string;
  role?: 'user' | 'assistant' | 'system';
  createdAt: string;
  updatedAt: string;
  matchedText: string;
  contextBefore?: string;
  contextAfter?: string;
}

interface APISearchStats {
  totalResults: number;
  sessionMatches: number;
  messageMatches: number;
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

class GlobalSearchService {
  private readonly DEFAULT_LIMIT = 50;

  /**
   * Search across all chat sessions and messages
   * Automatically tracks the search in history
   */
  async search(
    _userId: string,
    filters: SearchFilters,
    _options: { trackSearch?: boolean } = { trackSearch: true },
  ): Promise<{ results: SearchResult[]; stats: SearchStats }> {
    const startTime = Date.now();
    const limit = filters.limit || this.DEFAULT_LIMIT;

    const params = new URLSearchParams();
    params.set('q', filters.query);
    params.set('limit', String(limit));
    if (filters.includeArchived) params.set('includeArchived', 'true');
    if (filters.role) params.set('role', filters.role);
    if (filters.startDate) params.set('startDate', filters.startDate.toISOString());
    if (filters.endDate) params.set('endDate', filters.endDate.toISOString());

    const headers = await buildReadHeaders();
    const res = await fetch(`/api/search?${params.toString()}`, { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[GlobalSearch] Search failed:', err);
      throw new Error(`Search failed: ${(err as { error?: string }).error ?? res.statusText}`);
    }

    const data = (await res.json()) as {
      results: APISearchResult[];
      stats: APISearchStats;
    };

    const results: SearchResult[] = (data.results || []).map((r) => ({
      type: r.type,
      sessionId: r.sessionId,
      sessionTitle: r.sessionTitle,
      messageId: r.messageId,
      content: r.content,
      role: r.role,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
      matchedText: r.matchedText,
      contextBefore: r.contextBefore,
      contextAfter: r.contextAfter,
    }));

    const stats: SearchStats = {
      totalResults: data.stats?.totalResults ?? results.length,
      sessionMatches: data.stats?.sessionMatches ?? 0,
      messageMatches: data.stats?.messageMatches ?? 0,
      searchTime: Date.now() - startTime,
    };

    return { results, stats };
  }

  /**
   * Get recent searches for a user (deduplicated)
   */
  async getRecentSearches(_userId: string, limit: number = 10): Promise<RecentSearch[]> {
    try {
      const headers = await buildReadHeaders();
      const res = await fetch(`/api/search?type=recent&limit=${limit}`, { headers });

      if (!res.ok) {
        logger.error('[GlobalSearch] get_recent_searches failed:', res.statusText);
        return [];
      }

      const data = (await res.json()) as {
        searches: Array<{ query: string; result_count: number; created_at: string }>;
      };

      return (data.searches || []).map((row) => ({
        query: row.query,
        resultCount: row.result_count,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      logger.error('[GlobalSearch] Failed to get recent searches:', error);
      return [];
    }
  }

  /**
   * Get popular searches from the last N days
   */
  async getPopularSearches(limit: number = 10, days: number = 7): Promise<PopularSearch[]> {
    try {
      const headers = await buildReadHeaders();
      const res = await fetch(`/api/search?type=popular&limit=${limit}&days=${days}`, { headers });

      if (!res.ok) {
        logger.error('[GlobalSearch] get_popular_searches failed:', res.statusText);
        return [];
      }

      const data = (await res.json()) as {
        searches: Array<{ query: string; search_count: number; avg_results: number }>;
      };

      return (data.searches || []).map((row) => ({
        query: row.query,
        searchCount: row.search_count,
        avgResults: row.avg_results || 0,
      }));
    } catch (error) {
      logger.error('[GlobalSearch] Failed to get popular searches:', error);
      return [];
    }
  }

  /**
   * Clear all search history for a user
   */
  async clearSearchHistory(_userId: string): Promise<number> {
    try {
      const headers = await buildMutateHeaders();
      const res = await fetch('/api/search', {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        logger.error('[GlobalSearch] clear_search_history failed:', res.statusText);
        return 0;
      }

      const data = (await res.json()) as { cleared: number };
      return data.cleared ?? 0;
    } catch (error) {
      logger.error('[GlobalSearch] Failed to clear search history:', error);
      return 0;
    }
  }

  /**
   * Get search suggestions based on user history and popular searches
   */
  async getSearchSuggestions(
    _userId: string,
    partialQuery: string,
    limit: number = 5,
  ): Promise<SearchSuggestion[]> {
    if (partialQuery.trim().length < 2) return [];

    try {
      const params = new URLSearchParams({
        type: 'suggestions',
        q: partialQuery,
        limit: String(limit),
      });
      const headers = await buildReadHeaders();
      const res = await fetch(`/api/search?${params.toString()}`, { headers });

      if (!res.ok) {
        logger.error('[GlobalSearch] get_search_suggestions failed:', res.statusText);
        return [];
      }

      const data = (await res.json()) as {
        suggestions: Array<{ suggestion: string; source: string; score: number }>;
      };

      return (data.suggestions || []).map((row) => ({
        suggestion: row.suggestion,
        source: row.source as 'recent' | 'popular',
        score: row.score,
      }));
    } catch (error) {
      logger.error('[GlobalSearch] Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Search with autocomplete
   */
  async autocomplete(_userId: string, partialQuery: string, limit: number = 5): Promise<string[]> {
    if (partialQuery.trim().length < 2) return [];

    try {
      const suggestions = await this.getSearchSuggestions(_userId, partialQuery, limit);
      return suggestions.map((s) => s.suggestion).slice(0, limit);
    } catch (error) {
      logger.error('[GlobalSearch] Autocomplete failed:', error);
      return [];
    }
  }

  /**
   * Get trending search terms (last 7 days)
   * Returns simple string array for backward compatibility
   */
  async getTrendingSearchTerms(limit: number = 10): Promise<string[]> {
    const popular = await this.getPopularSearches(limit, 7);
    return popular.map((p) => p.query);
  }
}

export const globalSearchService = new GlobalSearchService();
