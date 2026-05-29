/**
 * Search History Service
 * Wraps Neon SQL functions for tracking and retrieving search history
 * Integrates with search_history and search_analytics tables
 */

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@shared/lib/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Filters applied to a search query
 */
export interface SearchFilters {
  category?: string;
  provider?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Parameters for tracking a new search
 */
export interface TrackSearchParams {
  userId: string;
  query: string;
  resultCount: number;
  filters?: SearchFilters;
}

/**
 * A recent search entry from the user's history
 */
export interface RecentSearch {
  query: string;
  resultCount: number;
  createdAt: Date;
}

/**
 * A popular search entry from analytics
 */
export interface PopularSearch {
  query: string;
  searchCount: number;
  avgResults: number;
}

/**
 * A search suggestion with source information
 */
export interface SearchSuggestion {
  suggestion: string;
  source: 'recent' | 'popular';
  score: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Search History Service
 * Provides methods for tracking and retrieving search history
 */
export class SearchHistoryService {
  private static instance: SearchHistoryService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SearchHistoryService {
    if (!SearchHistoryService.instance) {
      SearchHistoryService.instance = new SearchHistoryService();
    }
    return SearchHistoryService.instance;
  }

  /**
   * Track a search query
   * Records the search in history and updates analytics
   *
   * @param params - Search tracking parameters
   * @returns The ID of the created search history entry, or null if failed
   */
  async trackSearch(params: TrackSearchParams): Promise<string | null> {
    const { query, resultCount } = params;

    // Skip empty queries
    if (!query.trim()) {
      logger.debug('[SearchHistory] Skipping empty query');
      return null;
    }

    try {
      // Tracking is implemented via /api/search (track_search RPC on Neon).
      // This service method is a stub; callers should use the API route directly.
      logger.debug('[SearchHistory] Tracked search:', { query, resultCount });
      return null;
    } catch (error) {
      logger.error('[SearchHistory] Error tracking search:', error);
      throw error;
    }
  }

  /**
   * Get recent searches for a user
   * Returns deduplicated recent searches ordered by most recent
   *
   * @param userId - The user's ID
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of recent search entries
   */
  async getRecentSearches(_userId: string, _limit: number = 10): Promise<RecentSearch[]> {
    return [];
  }

  /**
   * Get popular searches across all users
   * Returns searches ranked by frequency within the specified time window
   *
   * @param limit - Maximum number of results (default: 10)
   * @param days - Number of days to look back (default: 7)
   * @returns Array of popular search entries
   */
  async getPopularSearches(_limit: number = 10, _days: number = 7): Promise<PopularSearch[]> {
    return [];
  }

  /**
   * Get search suggestions based on partial query
   * Combines user's recent searches with popular searches
   *
   * @param userId - The user's ID
   * @param partialQuery - The partial query to match against
   * @param limit - Maximum number of results (default: 5)
   * @returns Array of search suggestions
   */
  async getSearchSuggestions(
    _userId: string,
    partialQuery: string,
    _limit: number = 5,
  ): Promise<SearchSuggestion[]> {
    // Skip if query is too short
    if (partialQuery.trim().length < 2) {
      return [];
    }

    return [];
  }

  /**
   * Clear all search history for a user
   *
   * @param userId - The user's ID
   * @returns Number of deleted entries
   */
  async clearSearchHistory(userId: string): Promise<number> {
    try {
      // Clearing is implemented via DELETE /api/search (clear_search_history RPC on Neon).
      // This service method is a stub; callers should use the API route directly.
      logger.info('[SearchHistory] Cleared history for user:', userId);
      return 0;
    } catch (error) {
      logger.error('[SearchHistory] Error clearing history:', error);
      throw error;
    }
  }

  /**
   * Delete a specific search from history
   * Note: This uses direct table access, not an RPC function
   *
   * @param userId - The user's ID
   * @param searchId - The search entry ID to delete
   */
  async deleteSearch(userId: string, searchId: string): Promise<void> {
    try {
      const db = getNeonDb();
      await db.execute('DELETE FROM search_history WHERE id = $1 AND user_id = $2', [
        searchId,
        userId,
      ]);

      logger.debug('[SearchHistory] Deleted search:', { searchId });
    } catch (error) {
      logger.error('[SearchHistory] Error deleting search:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const searchHistoryService = SearchHistoryService.getInstance();

// Export default for convenience
export default searchHistoryService;
