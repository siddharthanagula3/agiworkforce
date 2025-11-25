import { invoke } from '@/lib/tauri-mock';
import {
    AlertCircle,
    Brain,
    ChevronDown,
    ChevronUp,
    Clock,
    Filter,
    Search,
    Star,
    Tag,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

export interface KnowledgeEntry {
  id: string;
  category: string;
  content: string;
  metadata: Record<string, string>;
  timestamp: number;
  importance: number;
}

interface KnowledgeBaseViewerProps {
  className?: string;
  maxEntries?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

type CategoryFilter = 'all' | 'goal' | 'experience' | 'plan' | 'learning';
type SortBy = 'importance' | 'timestamp';

export const KnowledgeBaseViewer: React.FC<KnowledgeBaseViewerProps> = ({
  className = '',
  maxEntries = 50,
  autoRefresh = false,
  refreshInterval = 5000,
}) => {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('importance');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const fetchKnowledge = useCallback(async () => {
    try {
      let data: KnowledgeEntry[];

      if (searchQuery.trim()) {
        // Query with search term
        data = await invoke<KnowledgeEntry[]>('query_knowledge', {
          query: searchQuery,
          limit: maxEntries,
        });
      } else {
        // Get recent entries
        data = await invoke<KnowledgeEntry[]>('get_recent_knowledge', {
          limit: maxEntries,
        });
      }

      setEntries(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch knowledge:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch knowledge');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, maxEntries]);

  useEffect(() => {
    fetchKnowledge();

    if (autoRefresh) {
      const interval = setInterval(fetchKnowledge, refreshInterval);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh, fetchKnowledge, refreshInterval]);

  useEffect(() => {
    let filtered = [...entries];

    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((entry) => entry.category === categoryFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'importance') {
        return b.importance - a.importance;
      } else {
        return b.timestamp - a.timestamp;
      }
    });

    setFilteredEntries(filtered);
  }, [entries, categoryFilter, sortBy]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEntries(newExpanded);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'goal':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'experience':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
      case 'plan':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'learning':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 0.8) return 'text-red-500';
    if (importance >= 0.5) return 'text-yellow-500';
    return 'text-gray-400';
  };

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center p-8 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
      >
        <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
          <Brain className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Loading knowledge...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}
      >
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Knowledge Base Error
            </p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
            <Brain className="w-4 h-4" />
            <span>Knowledge Base</span>
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
              ({filteredEntries.length})
            </span>
          </h3>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search knowledge..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Categories</option>
              <option value="goal">Goals</option>
              <option value="experience">Experiences</option>
              <option value="plan">Plans</option>
              <option value="learning">Learning</option>
            </select>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="importance">Sort by Importance</option>
            <option value="timestamp">Sort by Time</option>
          </select>
        </div>
      </div>

      {/* Entries List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No matching knowledge found' : 'No knowledge entries yet'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredEntries.map((entry) => {
              const isExpanded = expandedEntries.has(entry.id);
              const contentPreview =
                entry.content.length > 150
                  ? entry.content.substring(0, 150) + '...'
                  : entry.content;

              return (
                <div key={entry.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Category and Importance */}
                      <div className="flex items-center space-x-2 mb-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(entry.category)}`}
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {entry.category}
                        </span>
                        <div className="flex items-center space-x-1">
                          <Star
                            className={`w-3 h-3 ${getImportanceColor(entry.importance)}`}
                            fill="currentColor"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {(entry.importance * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimestamp(entry.timestamp)}</span>
                        </div>
                      </div>

                      {/* Content */}
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        {isExpanded ? entry.content : contentPreview}
                      </p>

                      {/* Metadata (when expanded) */}
                      {isExpanded && Object.keys(entry.metadata).length > 0 && (
                        <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                          <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Metadata:
                          </p>
                          <div className="space-y-1">
                            {Object.entries(entry.metadata).map(([key, value]) => (
                              <div key={key} className="flex items-start space-x-2">
                                <span className="text-gray-500 dark:text-gray-400">{key}:</span>
                                <span className="text-gray-700 dark:text-gray-300 flex-1">
                                  {value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expand/Collapse Button */}
                    {entry.content.length > 150 && (
                      <button
                        onClick={() => toggleExpanded(entry.id)}
                        className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
