'use client';

/**
 * AdminToolsPanel Component
 * Displays model information, token usage, and request history.
 * Shows estimated costs and allows request replay.
 *
 * Features:
 * - Model Info: name, context window, max tokens, pricing
 * - Token Usage: current session count, cost, breakdown (input vs output)
 * - Request History: recent requests with timestamps, sortable by time or cost
 */

import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { useModelStore } from '@/stores/unified/modelStore';
import { useBillingUsageStore } from '@/stores/unified/billingUsage';
import { useTokenUsage } from '@/hooks/useTokenUsage';

type SortField = 'time' | 'cost';

/**
 * Format cents to currency string (e.g., 150 → "$1.50")
 */
function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format large numbers with thousands separator
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format timestamp to relative time (e.g., "5 minutes ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * ModelInfoSection: Displays current model details and pricing
 */
function ModelInfoSection() {
  const selectedModel = useModelStore((state: any) => state.selectedModel);

  if (!selectedModel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No model selected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Model Name</p>
            <p className="font-medium">{selectedModel.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Context Window</p>
            <p className="font-medium">{formatNumber(selectedModel.contextWindow)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Max Output Tokens</p>
            <p className="font-medium">{formatNumber(selectedModel.maxTokens)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Provider</p>
            <p className="font-medium">{selectedModel.provider || 'Unknown'}</p>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-3">Pricing (per 1M tokens)</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Input</p>
              <p className="font-medium">
                ${selectedModel.costPerMillionInputTokens?.toFixed(2) ?? 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Output</p>
              <p className="font-medium">
                ${selectedModel.costPerMillionOutputTokens?.toFixed(2) ?? 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * TokenUsageSection: Displays current session token count and estimated cost
 */
function TokenUsageSection() {
  const { totalTokens, inputTokens, outputTokens, requestHistory } = useTokenUsage();
  const { sessionCost_cents: sessionCost } = useBillingUsageStore((state: any) => ({
    sessionCost_cents: state.sessionCost_cents,
  }));

  const inputPercentage = totalTokens > 0 ? ((inputTokens / totalTokens) * 100).toFixed(1) : 0;
  const outputPercentage = totalTokens > 0 ? ((outputTokens / totalTokens) * 100).toFixed(1) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Usage</CardTitle>
        <CardDescription>Current session statistics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total and Cost */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Total Tokens</p>
            <p className="text-2xl font-bold">{formatNumber(totalTokens)}</p>
          </div>
          <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
            <p className="text-sm text-muted-foreground">Session Cost</p>
            <p className="text-2xl font-bold">{formatCost(sessionCost)}</p>
          </div>
        </div>

        {/* Token Breakdown */}
        <div>
          <p className="text-sm font-semibold mb-3">Token Breakdown</p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-muted-foreground">Input</span>
                <span className="text-sm font-medium">
                  {formatNumber(inputTokens)} ({inputPercentage}%)
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${inputPercentage}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-muted-foreground">Output</span>
                <span className="text-sm font-medium">
                  {formatNumber(outputTokens)} ({outputPercentage}%)
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${outputPercentage}%` }} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * RequestHistorySection: Displays recent requests with sorting options
 */
function RequestHistorySection() {
  const { requestHistory } = useTokenUsage();
  const [sortBy, setSortBy] = useState<SortField>('time');

  const sortedHistory = useMemo(() => {
    const sorted = [...requestHistory];
    if (sortBy === 'time') {
      sorted.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      sorted.sort((a, b) => b.cost_cents - a.cost_cents);
    }
    return sorted;
  }, [requestHistory, sortBy]);

  const handleReplay = (requestId: string) => {
    // TODO: Implement request replay functionality
    console.log(`Replaying request: ${requestId}`);
  };

  if (requestHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Request History</CardTitle>
          <CardDescription>Recently executed requests</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No requests yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request History</CardTitle>
        <CardDescription>Recently executed requests</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Sort Controls */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSortBy('time')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              sortBy === 'time'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
            aria-label="sort by time"
          >
            Time
          </button>
          <button
            onClick={() => setSortBy('cost')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              sortBy === 'cost'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
            aria-label="sort by cost"
          >
            Cost
          </button>
        </div>

        {/* Request List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sortedHistory.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{formatNumber(request.tokens)} tokens</span>
                  <span className="text-xs text-muted-foreground">({request.model})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(request.timestamp)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm">{formatCost(request.cost_cents)}</span>
                <button
                  onClick={() => handleReplay(request.id)}
                  className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Replay"
                >
                  Replay
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * AdminToolsPanel: Main component combining all sections
 */
export function AdminToolsPanel() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold mb-2">Admin Tools Panel</h2>
        <p className="text-muted-foreground">Model information and usage analytics</p>
      </div>

      {/* Grid layout for sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModelInfoSection />
        <TokenUsageSection />
      </div>

      <RequestHistorySection />
    </div>
  );
}
