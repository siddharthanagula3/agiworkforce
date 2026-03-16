'use client';

/**
 * useTokenUsage Hook
 * Tracks token usage for the current session and request history.
 *
 * Provides:
 * - Total tokens used in session (input + output)
 * - Token breakdown (input vs output)
 * - Request history with timestamps, model, tokens, and cost
 * - Utilities for calculating costs based on model pricing
 */

import { useMemo } from 'react';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';
import { useBillingUsageStore } from '@/stores/unified/billingUsage';

export interface RequestHistoryItem {
  id: string;
  timestamp: number;
  model: string;
  tokens: number;
  cost_cents: number;
}

export interface TokenUsageData {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestHistory: RequestHistoryItem[];
}

/**
 * Calculates token usage from chat messages.
 * Estimates input and output tokens based on message metadata.
 */
function calculateTokenUsage(messages: any[]): {
  inputTokens: number;
  outputTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;

  messages.forEach((message) => {
    const tokenCount = message.metadata?.tokenCount ?? 0;

    if (message.role === 'user') {
      // User messages are input tokens
      inputTokens += tokenCount;
    } else if (message.role === 'assistant') {
      // Assistant messages are output tokens
      outputTokens += tokenCount;
    }
  });

  return { inputTokens, outputTokens };
}

/**
 * Builds request history from chat messages.
 * Each assistant message represents a completed request.
 */
function buildRequestHistory(messages: any[], selectedModel: any): RequestHistoryItem[] {
  const history: RequestHistoryItem[] = [];

  messages.forEach((message) => {
    if (message.role === 'assistant' && message.metadata?.tokenCount) {
      const tokenCount = message.metadata.tokenCount;
      const model = selectedModel?.id ?? 'unknown';

      // Estimate cost based on model pricing
      let estimatedCost = 0;
      if (selectedModel) {
        // Rough heuristic: use average of input/output pricing for simplicity
        // In reality, you'd need to split tokens between input and output
        const avgCostPerMillion =
          (selectedModel.costPerMillionInputTokens + selectedModel.costPerMillionOutputTokens) / 2;
        estimatedCost = Math.ceil((tokenCount / 1000000) * avgCostPerMillion * 100); // cents
      }

      history.push({
        id: message.id ?? crypto.randomUUID(),
        timestamp: message.timestamp?.getTime() ?? Date.now(),
        model,
        tokens: tokenCount,
        cost_cents: estimatedCost,
      });
    }
  });

  // Sort by timestamp descending (most recent first)
  return history.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Custom hook to track token usage across the session.
 * Returns total tokens, breakdown, and request history.
 */
export function useTokenUsage(): TokenUsageData {
  const messages = useUnifiedChatStore((state) => state.messages);
  const selectedModel = useUnifiedChatStore((state) => state.selectedModel);

  const usageData = useMemo(() => {
    const { inputTokens, outputTokens } = calculateTokenUsage(messages);
    const totalTokens = inputTokens + outputTokens;
    const requestHistory = buildRequestHistory(messages, selectedModel);

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      requestHistory,
    };
  }, [messages, selectedModel]);

  return usageData;
}
