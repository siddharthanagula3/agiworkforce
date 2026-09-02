import { logger } from '@shared/lib/logger';

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';

export interface SearchResult {
  type: 'session' | 'message' | 'project' | 'file';
  sessionId: string;
  sessionTitle: string;
  messageId?: string;
  content: string;
  role?: 'user' | 'assistant' | 'system';
  createdAt: Date;
  updatedAt: Date;
  matchedText: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface SearchFilters {
  query: string;
  sessionIds?: string[];
  startDate?: Date;
  endDate?: Date;
  role?: 'user' | 'assistant' | 'system';
  includeArchived?: boolean;
  limit?: number;
}

export interface SearchStats {
  totalResults: number;
  sessionMatches: number;
  messageMatches: number;
  projectMatches: number;
  fileMatches: number;
  searchTime: number;
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
  projectMatches?: number;
  fileMatches?: number;
}

interface APIProjectResult {
  type: 'project';
  projectId: string;
  projectName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  matchedText: string;
  contextBefore?: string;
  contextAfter?: string;
}

interface APIFileResult {
  type: 'file';
  fileId: string;
  fileName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  matchedText: string;
  contextBefore?: string;
  contextAfter?: string;
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

  async search(
    _userId: string,
    filters: SearchFilters,
    _options: { trackSearch?: boolean; signal?: AbortSignal } = { trackSearch: true },
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
    const res = await fetch(`/api/search?${params.toString()}`, {
      headers,
      ...(_options.signal ? { signal: _options.signal } : {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[GlobalSearch] Search failed:', err);
      throw new Error(`Search failed: ${(err as { error?: string }).error ?? res.statusText}`);
    }

    const data = (await res.json()) as {
      results: APISearchResult[];
      projects?: APIProjectResult[];
      files?: APIFileResult[];
      stats: APISearchStats;
    };

    const conversationResults: SearchResult[] = (data.results || []).map((r) => ({
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

    const projectResults: SearchResult[] = (data.projects || []).map((p) => ({
      type: 'project' as const,
      sessionId: p.projectId,
      sessionTitle: p.projectName,
      content: p.content,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
      matchedText: p.matchedText,
      contextBefore: p.contextBefore,
      contextAfter: p.contextAfter,
    }));

    const fileResults: SearchResult[] = (data.files || []).map((f) => ({
      type: 'file' as const,
      sessionId: f.fileId,
      sessionTitle: f.fileName,
      content: f.content,
      createdAt: new Date(f.createdAt),
      updatedAt: new Date(f.updatedAt),
      matchedText: f.matchedText,
      contextBefore: f.contextBefore,
      contextAfter: f.contextAfter,
    }));

    const results: SearchResult[] = [...conversationResults, ...projectResults, ...fileResults];

    const projectMatches = data.stats?.projectMatches ?? projectResults.length;
    const fileMatches = data.stats?.fileMatches ?? fileResults.length;
    const stats: SearchStats = {
      totalResults:
        (data.stats?.totalResults ?? conversationResults.length) + projectMatches + fileMatches,
      sessionMatches: data.stats?.sessionMatches ?? 0,
      messageMatches: data.stats?.messageMatches ?? 0,
      projectMatches,
      fileMatches,
      searchTime: Date.now() - startTime,
    };

    return { results, stats };
  }

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

  async getTrendingSearchTerms(limit: number = 10): Promise<string[]> {
    const popular = await this.getPopularSearches(limit, 7);
    return popular.map((p) => p.query);
  }
}

export const globalSearchService = new GlobalSearchService();
