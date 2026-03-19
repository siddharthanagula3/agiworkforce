import { api } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelUsage {
  modelId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface DailyUsage {
  /** ISO date string, e.g. "2026-03-12" */
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface UsageSummary {
  /** Current billing period label, e.g. "March 2026" */
  period: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  conversationCount: number;
  modelBreakdown: ModelUsage[];
  /** Last 7 calendar days, oldest first */
  dailyUsage: DailyUsage[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Fetch the usage summary for the current billing period.
 * Throws on network/auth failure — callers should catch and handle gracefully.
 */
export async function fetchUsageSummary(): Promise<UsageSummary> {
  return api.get<UsageSummary>('/api/usage/summary');
}
