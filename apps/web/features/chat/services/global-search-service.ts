import { logger } from '@shared/lib/logger';

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';

export type IndexedSearchSourceType =
  | 'project_knowledge'
  | 'library_file'
  | 'conversation'
  | 'artifact'
  | 'research_report'
  | 'developer_session';

export interface SearchResult {
  type:
    | 'session'
    | 'message'
    | 'project'
    | 'file'
    | 'artifact'
    | 'research_report'
    | 'developer_session'
    | 'project_knowledge';
  href?: string;
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

export function globalSearchResultHref(result: SearchResult, query?: string): string {
  if (result.href) return result.href;
  if (result.type === 'project') return `/chat/projects/${encodeURIComponent(result.sessionId)}`;
  if (result.type === 'file') return '/chat/library';
  const conversation = `/chat/${encodeURIComponent(result.sessionId)}`;
  if (!result.messageId) return conversation;
  const message = `${conversation}?highlightMessage=${encodeURIComponent(result.messageId)}`;
  const needle = query?.trim();
  return needle ? `${message}&highlightQuery=${encodeURIComponent(needle)}` : message;
}

export interface SearchFilters {
  query: string;
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
  documentMatches: number;
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

interface APIDocumentResult {
  type: IndexedSearchSourceType;
  sourceId: string;
  title: string;
  href: string;
  snippet: string;
  matchedTerms: string[];
  messageId?: string;
  indexedAt: string | null;
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
    options: { trackSearch?: boolean; signal?: AbortSignal } = { trackSearch: true },
  ): Promise<{ results: SearchResult[]; stats: SearchStats }> {
    const startTime = Date.now();
    const limit = filters.limit || this.DEFAULT_LIMIT;

    const params = new URLSearchParams();
    params.set('q', filters.query);
    params.set('limit', String(limit));
    if (options.trackSearch === false) params.set('track', 'false');
    if (filters.includeArchived) params.set('includeArchived', 'true');
    if (filters.role) params.set('role', filters.role);
    if (filters.startDate) params.set('startDate', filters.startDate.toISOString());
    if (filters.endDate) params.set('endDate', filters.endDate.toISOString());

    const headers = await buildReadHeaders();
    const res = await fetch(`/api/search?${params.toString()}`, {
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
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
      documents?: APIDocumentResult[];
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

    const seenConversations = new Set(conversationResults.map((r) => r.sessionId));
    const seenFiles = new Set(fileResults.map((r) => r.sessionId));
    const documentResults: SearchResult[] = (data.documents || []).flatMap(
      (document): SearchResult[] => {
        if (document.type === 'conversation' && seenConversations.has(document.sourceId)) return [];
        if (document.type === 'library_file' && seenFiles.has(document.sourceId)) return [];
        const indexedAt = document.indexedAt ? new Date(document.indexedAt) : new Date(0);
        return [
          {
            type:
              document.type === 'conversation'
                ? document.messageId
                  ? 'message'
                  : 'session'
                : document.type === 'library_file'
                  ? 'file'
                  : document.type,
            href: document.href,
            sessionId: document.sourceId,
            sessionTitle: document.title,
            ...(document.messageId ? { messageId: document.messageId } : {}),
            content: document.snippet,
            createdAt: indexedAt,
            updatedAt: indexedAt,
            matchedText: document.snippet,
          },
        ];
      },
    );

    const results: SearchResult[] = [
      ...conversationResults,
      ...projectResults,
      ...fileResults,
      ...documentResults,
    ];

    const projectMatches = data.stats?.projectMatches ?? projectResults.length;
    const fileMatches = data.stats?.fileMatches ?? fileResults.length;
    const stats: SearchStats = {
      totalResults:
        (data.stats?.totalResults ?? conversationResults.length) +
        projectMatches +
        fileMatches +
        documentResults.length,
      sessionMatches: data.stats?.sessionMatches ?? 0,
      messageMatches: data.stats?.messageMatches ?? 0,
      projectMatches,
      fileMatches,
      documentMatches: documentResults.length,
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
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/search', {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      throw new Error(`Clearing search history failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json().catch(() => null)) as { cleared?: unknown } | null;
    return typeof data?.cleared === 'number' ? data.cleared : 0;
  }
}

export const globalSearchService = new GlobalSearchService();
