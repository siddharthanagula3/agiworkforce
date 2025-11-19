import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  MessageSquare,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import type { UsageStats } from '../../stores/modelStore';
import { PROVIDER_LABELS } from '../../constants/llm';
import type { Provider } from '../../stores/settingsStore';
import { cn } from '../../lib/utils';

interface CostEstimatorProps {
  className?: string;
}

export const CostEstimator: React.FC<CostEstimatorProps> = ({ className }) => {
  const { usageStats, refreshUsageStats, loading } = useModelStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Load stats on mount
    void refreshUsageStats();
  }, [refreshUsageStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshUsageStats();
    setIsRefreshing(false);
  };

  if (loading && !usageStats) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const stats = usageStats || {
    totalTokens: 0,
    totalCost: 0,
    messageCount: 0,
    byProvider: {} as UsageStats['byProvider'],
    byModel: {},
  };

  // Calculate monthly projection (assuming current usage is for current month)
  const currentDate = new Date();
  const dayOfMonth = currentDate.getDate();
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const projectedMonthlyCost = (stats.totalCost / dayOfMonth) * daysInMonth;

  // Calculate average cost per message
  const avgCostPerMessage = stats.messageCount > 0 ? stats.totalCost / stats.messageCount : 0;

  // Get top models by usage
  const topModels = Object.entries(stats.byModel ?? {})
    .sort(([, a], [, b]) => b.cost - a.cost)
    .slice(0, 5);

  // Get provider breakdown
  const providerBreakdown = Object.entries(stats.byProvider ?? {})
    .filter(([, data]) => data.cost > 0)
    .sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage & Cost Tracking
          </h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Track your LLM API usage and estimated costs across all providers and models
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Cost */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Total Spent
              </span>
              <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              ${stats.totalCost.toFixed(4)}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {stats.totalTokens.toLocaleString()} tokens
            </div>
          </div>

          {/* Monthly Projection */}
          <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Monthly Projection
              </span>
              <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              ${projectedMonthlyCost.toFixed(2)}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              {projectedMonthlyCost > stats.totalCost ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              Based on day {dayOfMonth}/{daysInMonth}
            </div>
          </div>

          {/* Avg Cost per Message */}
          <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Avg per Message
              </span>
              <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              ${avgCostPerMessage.toFixed(4)}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              {stats.messageCount} messages
            </div>
          </div>
        </div>

        {/* Provider Breakdown */}
        {providerBreakdown.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
              Cost by Provider
            </h3>
            <div className="space-y-2">
              {providerBreakdown.map(([provider, data]) => {
                const percentage = stats.totalCost > 0 ? (data.cost / stats.totalCost) * 100 : 0;
                return (
                  <div
                    key={provider}
                    className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {PROVIDER_LABELS[provider as Provider]}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {data.messages} messages
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        ${data.cost.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{data.tokens.toLocaleString()} tokens</span>
                      <span>{percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Models */}
        {topModels.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
              Top Models by Cost
            </h3>
            <div className="space-y-2">
              {topModels.map(([modelId, data], index) => {
                const percentage = stats.totalCost > 0 ? (data.cost / stats.totalCost) * 100 : 0;
                return (
                  <div
                    key={modelId}
                    className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {modelId}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {data.messages} messages
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        ${data.cost.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{data.tokens.toLocaleString()} tokens</span>
                      <span>{percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats.totalCost === 0 && (
          <div className="text-center py-12">
            <DollarSign className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No usage yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Start chatting to see your usage statistics
            </p>
          </div>
        )}

        {/* Cost Optimization Tips */}
        {stats.totalCost > 0 && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Cost Optimization Tips
            </h4>
            <ul className="space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
              <li>• Use Claude Haiku 4.5 for simple tasks (4x faster, 1/3 cost of Sonnet)</li>
              <li>• Use local models via Ollama for zero-cost inference</li>
              <li>• Enable response caching to reduce redundant API calls</li>
              <li>• Set a token budget limit in settings to control spending</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
