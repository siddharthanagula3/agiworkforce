/**
 * Token Logger Service
 * Tracks LLM token usage across all providers with granular billing
 */

import { getModelMetadataById, listCanonicalModels, normalizeModelId } from '@agiworkforce/types';
import { UsageTracker } from '@features/billing/services/usage-monitor';
import type { LLMProvider } from '@core/ai/llm/unified-language-model';

export interface TokenLogEntry {
  userId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: Date;
  taskDescription?: string;
}

export interface TokenUsageByModel {
  [model: string]: {
    provider: LLMProvider;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    callCount: number;
  };
}

export interface SessionTokenSummary {
  sessionId: string;
  userId: string;
  totalTokens: number;
  totalCost: number;
  byModel: TokenUsageByModel;
  startTime: Date;
  lastUpdate: Date;
}

const FALLBACK_PRICING = {
  input: 1.0,
  output: 1.0,
  provider: 'openai' as LLMProvider,
};

function toUsageProvider(provider: string | null | undefined): LLMProvider {
  switch ((provider ?? '').toLowerCase()) {
    case 'anthropic':
    case 'openai':
    case 'google':
    case 'perplexity':
    case 'deepseek':
    case 'qwen':
      return provider as LLMProvider;
    case 'xai':
    case 'grok':
      return 'grok';
    default:
      return 'openai';
  }
}

function getPricingForModel(model: string): {
  input: number;
  output: number;
  provider: LLMProvider;
} {
  const canonicalModelId = normalizeModelId(model) ?? model;
  const metadata = getModelMetadataById(canonicalModelId);

  if (!metadata) {
    return FALLBACK_PRICING;
  }

  return {
    input: metadata.inputCost,
    output: metadata.outputCost,
    provider: toUsageProvider(metadata.provider),
  };
}

function getModelPricingOrNull(
  model: string,
): { input: number; output: number; provider: LLMProvider } | null {
  const canonicalModelId = normalizeModelId(model) ?? model;
  const metadata = getModelMetadataById(canonicalModelId);
  if (!metadata) {
    return null;
  }

  return {
    input: metadata.inputCost,
    output: metadata.outputCost,
    provider: toUsageProvider(metadata.provider),
  };
}

/**
 * Custom async mutex for serializing token-counting updates per session.
 *
 * WHY this is needed:
 * `logTokenUsage` performs a read-modify-write cycle (read session summary,
 * update totals, persist to DB). Multiple concurrent LLM calls for the same
 * session can interleave these steps, causing lost updates to running totals
 * (e.g., two calls each read totalTokens=100, both write 100+N instead of
 * 100+N+M). JavaScript's single-threaded execution does NOT prevent this
 * because each step awaits async I/O (the DB persist), yielding the event
 * loop between the read and write phases.
 *
 * Standard JS has no built-in async mutex primitive. Libraries like
 * `async-mutex` exist but add a dependency for a ~30-line utility.
 * This lightweight implementation uses a FIFO promise queue so waiters
 * execute in arrival order, which is sufficient for our use case.
 *
 * Locks are per-session (via `sessionLocks` Map) so updates to different
 * sessions proceed in parallel without contention.
 */
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function with the lock held
   */
  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export class TokenLoggerService {
  private usageTracker: UsageTracker;
  private sessionCache: Map<string, SessionTokenSummary>;
  private logEntries: Map<string, TokenLogEntry[]>; // sessionId -> entries
  private sessionLocks: Map<string, AsyncMutex>; // Per-session locks to allow parallel updates to different sessions

  constructor() {
    this.usageTracker = new UsageTracker();
    this.sessionCache = new Map();
    this.logEntries = new Map();
    this.sessionLocks = new Map();
  }

  /**
   * Get or create a lock for a specific session
   */
  private getSessionLock(sessionId: string): AsyncMutex {
    let lock = this.sessionLocks.get(sessionId);
    if (!lock) {
      lock = new AsyncMutex();
      this.sessionLocks.set(sessionId, lock);
    }
    return lock;
  }

  /**
   * Log token usage for an LLM API call
   * This is the main function that external services will call
   * Uses per-session locking to prevent race conditions during concurrent updates
   */
  async logTokenUsage(
    model: string,
    tokensUsed: number,
    userId: string,
    sessionId?: string,
    agentId?: string,
    agentName?: string,
    inputTokens?: number,
    outputTokens?: number,
    taskDescription?: string,
  ): Promise<void> {
    const effectiveSessionId = sessionId || 'default';
    const lock = this.getSessionLock(effectiveSessionId);

    // Use lock to ensure atomic read-modify-write operations
    await lock.withLock(async () => {
      const pricing = getPricingForModel(model);
      const provider = pricing.provider;

      // Calculate cost - use actual values if provided, otherwise estimate
      // NOTE: All providers should provide actual input/output tokens from API responses
      const actualInputTokens = inputTokens ?? (tokensUsed > 0 ? Math.floor(tokensUsed * 0.4) : 0);
      const actualOutputTokens = outputTokens ?? (tokensUsed > 0 ? Math.ceil(tokensUsed * 0.6) : 0);

      // Validate token values
      if (tokensUsed > 0 && actualInputTokens === 0 && actualOutputTokens === 0) {
        console.warn(
          `[TokenLogger] ⚠️ No input/output tokens provided for ${model}, using estimation`,
        );
      }

      // Validate that input + output equals total (with small tolerance for rounding)
      const calculatedTotal = actualInputTokens + actualOutputTokens;
      if (tokensUsed > 0 && Math.abs(calculatedTotal - tokensUsed) > 1) {
        console.warn(
          `[TokenLogger] ⚠️ Token mismatch for ${model}: input(${actualInputTokens}) + output(${actualOutputTokens}) = ${calculatedTotal}, but total = ${tokensUsed}`,
        );
      }
      const cost = this.calculateCost(model, actualInputTokens, actualOutputTokens);

      const entry: TokenLogEntry = {
        userId,
        sessionId: effectiveSessionId,
        agentId: agentId || 'unknown',
        agentName: agentName || 'Unknown Agent',
        provider,
        model,
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        totalTokens: tokensUsed,
        cost,
        timestamp: new Date(),
        taskDescription,
      };

      // Store in memory cache (atomic within lock)
      let entries = this.logEntries.get(effectiveSessionId);
      if (!entries) {
        entries = [];
        this.logEntries.set(effectiveSessionId, entries);
      }
      entries.push(entry);

      // Update session summary (atomic within lock)
      this.updateSessionSummary(entry);

      // Persist to database via UsageTracker
      // Note: This is still inside the lock to ensure ordering consistency
      try {
        await this.usageTracker.trackAPICall({
          userId,
          agentType: agentName || 'Unknown Agent',
          provider: model,
          tokensUsed,
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          taskId: effectiveSessionId,
          timestamp: entry.timestamp,
          cost,
        });
      } catch (error) {
        console.error('[TokenLogger] Failed to persist to database:', error);
        // Don't throw - continue even if DB persist fails
        // The in-memory tracking is still accurate
      }
    });
  }

  /**
   * Calculate cost for a specific model
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = getPricingForModel(model);

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Update session summary in cache
   */
  private updateSessionSummary(entry: TokenLogEntry): void {
    let summary = this.sessionCache.get(entry.sessionId);

    if (!summary) {
      summary = {
        sessionId: entry.sessionId,
        userId: entry.userId,
        totalTokens: 0,
        totalCost: 0,
        byModel: {},
        startTime: entry.timestamp,
        lastUpdate: entry.timestamp,
      };
      this.sessionCache.set(entry.sessionId, summary);
    }

    // Update totals
    summary.totalTokens += entry.totalTokens;
    summary.totalCost += entry.cost;
    summary.lastUpdate = entry.timestamp;

    // Update by-model breakdown
    if (!summary.byModel[entry.model]) {
      summary.byModel[entry.model] = {
        provider: entry.provider,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        callCount: 0,
      };
    }

    const modelStats = summary.byModel[entry.model];
    modelStats!.inputTokens += entry.inputTokens;
    modelStats!.outputTokens += entry.outputTokens;
    modelStats!.totalTokens += entry.totalTokens;
    modelStats!.cost += entry.cost;
    modelStats!.callCount += 1;
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): SessionTokenSummary | null {
    return this.sessionCache.get(sessionId) || null;
  }

  /**
   * Get all log entries for a session
   */
  getSessionLogs(sessionId: string): TokenLogEntry[] {
    return this.logEntries.get(sessionId) || [];
  }

  /**
   * Get real-time token usage (for live updates)
   */
  getRealtimeUsage(sessionId: string): {
    totalTokens: number;
    totalCost: number;
    byModel: TokenUsageByModel;
  } {
    const summary = this.getSessionSummary(sessionId);
    if (!summary) {
      return {
        totalTokens: 0,
        totalCost: 0,
        byModel: {},
      };
    }

    return {
      totalTokens: summary.totalTokens,
      totalCost: summary.totalCost,
      byModel: summary.byModel,
    };
  }

  /**
   * Clear session cache
   */
  clearSessionCache(sessionId: string): void {
    this.sessionCache.delete(sessionId);
    this.logEntries.delete(sessionId);
    this.sessionLocks.delete(sessionId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.sessionCache.clear();
    this.logEntries.clear();
    this.sessionLocks.clear();
  }

  /**
   * Get supported models
   */
  static getSupportedModels(): string[] {
    return listCanonicalModels().map((model) => model.id);
  }

  /**
   * Get pricing for a model
   */
  static getModelPricing(
    model: string,
  ): { input: number; output: number; provider: LLMProvider } | null {
    return getModelPricingOrNull(model);
  }
}

// Export singleton instance
export const tokenLogger = new TokenLoggerService();

// Export convenience function for external use
export function logTokenUsage(
  model_name: string,
  tokens_used: number,
  user_id: string,
): Promise<void> {
  return tokenLogger.logTokenUsage(model_name, tokens_used, user_id);
}
