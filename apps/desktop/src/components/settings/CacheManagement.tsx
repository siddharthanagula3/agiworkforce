/**
 * Cache Management Component
 *
 * UI component for managing cache in the Settings panel.
 * Displays cache statistics and provides controls for clearing cache.
 */

import React, { useEffect, useState } from 'react';
import { CacheService } from '../../services/cacheService';
import type { CacheStats, CacheAnalytics } from '../../types/cache';

export const CacheManagement: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [analytics, setAnalytics] = useState<CacheAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cache statistics on component mount
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, analyticsData] = await Promise.all([
        CacheService.getStats(),
        CacheService.getAnalytics(),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cache stats');
      console.error('Error loading cache stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all cache? This cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await CacheService.clearAll();
      await loadStats(); // Reload stats
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
      console.error('Error clearing cache:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearByType = async (type: 'llm' | 'tool' | 'codebase') => {
    try {
      setLoading(true);
      await CacheService.clearByType(type);
      await loadStats(); // Reload stats
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to clear ${type} cache`);
      console.error(`Error clearing ${type} cache:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handlePruneExpired = async () => {
    try {
      setLoading(true);
      const pruned = await CacheService.pruneExpired();
      alert(`Pruned ${pruned} expired cache entries`);
      await loadStats(); // Reload stats
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prune expired cache');
      console.error('Error pruning cache:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const exportData = await CacheService.export();

      // Download as JSON file
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cache-export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export cache');
      console.error('Error exporting cache:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMB = (mb: number) => mb.toFixed(2);
  const formatCurrency = (usd: number) => `$${usd.toFixed(4)}`;

  if (loading && !stats) {
    return <div className="p-4">Loading cache statistics...</div>;
  }

  if (error && !stats) {
    return (
      <div className="p-4 text-red-600">
        <p>Error: {error}</p>
        <button
          onClick={loadStats}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-2xl font-bold mb-4">Cache Management</h2>
        <p className="text-gray-600 mb-4">
          Monitor and manage cache to optimize performance and reduce costs.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-600">
          {error}
        </div>
      )}

      {/* Overall Statistics */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Overall Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Cache Size</p>
            <p className="text-2xl font-bold">{stats ? formatMB(stats.total_size_mb) : '0.00'} MB</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Cost Savings</p>
            <p className="text-2xl font-bold text-green-600">
              {stats ? formatCurrency(stats.total_savings_usd) : '$0.00'}
            </p>
          </div>
        </div>
      </div>

      {/* LLM Cache */}
      {stats && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">LLM Cache</h3>
            <button
              onClick={() => handleClearByType('llm')}
              disabled={loading || stats.llm_cache.entries === 0}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear LLM Cache
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Entries</p>
              <p className="text-xl font-semibold">{stats.llm_cache.entries}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Size</p>
              <p className="text-xl font-semibold">{formatMB(stats.llm_cache.size_mb)} MB</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Savings</p>
              <p className="text-xl font-semibold text-green-600">
                {stats.llm_cache.savings_usd ? formatCurrency(stats.llm_cache.savings_usd) : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Analytics */}
      {analytics && analytics.most_cached_queries.length > 0 && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Most Cached Queries</h3>
          <div className="space-y-2">
            {analytics.most_cached_queries.slice(0, 5).map((query, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {query.provider} / {query.model}
                  </p>
                  <p className="text-xs text-gray-500">
                    Hash: {query.prompt_hash.substring(0, 16)}...
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{query.hit_count} hits</p>
                  <p className="text-xs text-green-600">{formatCurrency(query.cost_saved)} saved</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Breakdown */}
      {analytics && analytics.provider_breakdown.length > 0 && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Cache by Provider</h3>
          <div className="space-y-2">
            {analytics.provider_breakdown.map((provider, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                  <p className="text-sm font-medium capitalize">{provider.provider}</p>
                  <p className="text-xs text-gray-500">{provider.entries} entries</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-600">
                    {formatCurrency(provider.cost_saved)}
                  </p>
                  <button
                    onClick={() => CacheService.clearByProvider(provider.provider)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Cache Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadStats}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Refresh Stats
          </button>
          <button
            onClick={handlePruneExpired}
            disabled={loading}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            Prune Expired
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Export Cache
          </button>
          <button
            onClick={handleClearAll}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            Clear All Cache
          </button>
        </div>
      </div>
    </div>
  );
};
