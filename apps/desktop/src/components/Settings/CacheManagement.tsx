/**
 * Cache Management Component
 *
 * UI component for managing cache in the Settings panel.
 * Displays cache statistics and provides controls for clearing cache.
 */

import React, { useEffect, useState } from 'react';
import { CacheService } from '../../services/cacheService';
import { toast } from 'sonner';
import type { CacheStats, CacheAnalytics } from '../../types/cache';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';

export const CacheManagement: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [analytics, setAnalytics] = useState<CacheAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [clearLLMDialogOpen, setClearLLMDialogOpen] = useState(false);
  const [clearProviderDialog, setClearProviderDialog] = useState<string | null>(null);

  // Load cache statistics on component mount
  useEffect(() => {
    void loadStats();
  }, []);

  const loadStats = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const statsData = await CacheService.getStats();
      setStats(statsData);

      void (async () => {
        try {
          const analyticsData = await CacheService.getAnalytics();
          setAnalytics(analyticsData);
        } catch (analyticsError) {
          console.error('Error loading cache analytics:', analyticsError);
        }
      })();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cache stats');
      console.error('Error loading cache stats:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleClearAll = async () => {
    try {
      setLoading(true);
      await CacheService.clearAll();
      toast.success('Cache cleared', {
        description: 'All cache entries have been removed.',
      });
      void loadStats(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear cache';
      setError(message);
      toast.error('Clear failed', {
        description: message,
      });
      console.error('Error clearing cache:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearByType = async (type: 'llm' | 'tool' | 'codebase') => {
    try {
      setLoading(true);
      await CacheService.clearByType(type);
      toast.success('Cache cleared', {
        description: `The ${type} cache has been removed.`,
      });
      void loadStats(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to clear ${type} cache`);
      toast.error('Clear failed', {
        description: err instanceof Error ? err.message : `Failed to clear ${type} cache`,
      });
      console.error(`Error clearing ${type} cache:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearByProvider = async (provider: string) => {
    try {
      setLoading(true);
      await CacheService.clearByProvider(provider);
      toast.success('Provider cache cleared', {
        description: `Cache for ${provider} has been removed.`,
      });
      void loadStats(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to clear cache for ${provider}`;
      toast.error('Clear failed', {
        description: message,
      });
      console.error(`Error clearing cache for provider ${provider}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handlePruneExpired = async () => {
    try {
      setLoading(true);
      const pruned = await CacheService.pruneExpired();
      toast.success('Cache pruned', {
        description: `Successfully removed ${pruned} expired cache entries`,
      });
      void loadStats(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prune expired cache');
      toast.error('Prune failed', {
        description: err instanceof Error ? err.message : 'Failed to prune expired cache',
      });
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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        <p>Failed to load cache statistics. Please try again.</p>
        <button
          type="button"
          onClick={() => void loadStats()}
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
          Something went wrong loading cache data. Please try refreshing.
        </div>
      )}

      {/* Overall Statistics */}
      <div className="bg-card border rounded-lg p-4 shadow-xs">
        <h3 className="text-lg font-semibold mb-4">Overall Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Cache Size</p>
            <p className="text-2xl font-bold">
              {stats ? formatMB(stats.total_size_mb) : '0.00'} MB
            </p>
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
        <div className="bg-card border rounded-lg p-4 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">LLM Cache</h3>
            <button
              type="button"
              onClick={() => setClearLLMDialogOpen(true)}
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
        <div className="bg-card border rounded-lg p-4 shadow-xs">
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
        <div className="bg-card border rounded-lg p-4 shadow-xs">
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
                    type="button"
                    onClick={() => setClearProviderDialog(provider.provider)}
                    disabled={loading}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="bg-card border rounded-lg p-4 shadow-xs">
        <h3 className="text-lg font-semibold mb-4">Cache Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadStats()}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Refresh Stats
          </button>
          <button
            type="button"
            onClick={handlePruneExpired}
            disabled={loading}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            Prune Expired
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Export Cache
          </button>
          <button
            type="button"
            onClick={() => setClearAllDialogOpen(true)}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            Clear All Cache
          </button>
        </div>
      </div>

      {/* Confirmation dialog for clearing LLM cache */}
      <AlertDialog open={clearLLMDialogOpen} onOpenChange={setClearLLMDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear LLM Cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all cached responses. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClearLLMDialogOpen(false);
                void handleClearByType('llm');
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Clear LLM Cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for clearing a provider's cache */}
      <AlertDialog
        open={clearProviderDialog !== null}
        onOpenChange={(open) => {
          if (!open) setClearProviderDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear provider cache?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (clearProviderDialog !== null) {
                  const provider = clearProviderDialog;
                  setClearProviderDialog(null);
                  void handleClearByProvider(provider);
                  return;
                }
                setClearProviderDialog(null);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for clearing all cache */}
      <AlertDialog
        open={clearAllDialogOpen}
        onOpenChange={(open) => {
          if (!open) setClearAllDialogOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all cached LLM responses, tool results, and codebase data. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClearAllDialogOpen(false);
                void handleClearAll();
              }}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
            >
              Clear All Cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
