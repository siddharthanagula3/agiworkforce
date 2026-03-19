/**
 * Workspace Analytics Types
 *
 * Types for enterprise-grade workspace usage tracking, cost attribution,
 * and quota enforcement. These types are consumed by:
 *   - Web dashboard billing and usage pages
 *   - API Gateway usage metering middleware
 *   - Desktop analytics reporting
 *   - Mobile usage summary screens
 *
 * All monetary values are in USD unless stated otherwise.
 *
 * @module workspace-analytics
 * @packageDocumentation
 */

// ============================================================================
// Analytics Event
// ============================================================================

/**
 * A single analytics event emitted by any surface within a workspace.
 *
 * Events are append-only. Once stored they are never mutated. The
 * `metadata` bag carries event-type-specific fields.
 *
 * Event type semantics:
 * - `agent_execution` — an agent session started, completed, or failed.
 * - `tool_usage`      — a single tool call was made by an agent or user.
 * - `model_call`      — a direct LLM inference call (token counts in metadata).
 * - `user_action`     — a user-initiated UI action (page view, feature click, etc.).
 *
 * @example
 * ```typescript
 * const event: WorkspaceAnalyticsEvent = {
 *   id: 'evt-abc-001',
 *   workspaceId: 'ws-acme',
 *   userId: 'usr-alice',
 *   eventType: 'model_call',
 *   eventName: 'claude-opus-4-6/chat',
 *   metadata: { inputTokens: 1200, outputTokens: 340, costUsd: 0.048 },
 *   timestamp: '2026-03-19T10:00:00Z',
 * };
 * ```
 */
export interface WorkspaceAnalyticsEvent {
  /** Unique event identifier (UUID v4). */
  id: string;

  /** Workspace that owns this event. */
  workspaceId: string;

  /** User who triggered the event. */
  userId: string;

  /** High-level event category. */
  eventType: 'agent_execution' | 'tool_usage' | 'model_call' | 'user_action';

  /**
   * Specific event name within the category.
   *
   * Examples: `"agent/started"`, `"tool/bash"`, `"claude-opus-4-6/chat"`,
   * `"ui/settings_opened"`.
   */
  eventName: string;

  /** Event-type-specific key-value data. */
  metadata: Record<string, unknown>;

  /** ISO 8601 timestamp when the event occurred. */
  timestamp: string;
}

// ============================================================================
// Analytics Summary
// ============================================================================

/**
 * Pre-aggregated usage summary for a workspace over a time period.
 *
 * Summaries are computed asynchronously (typically every hour) and
 * persisted for fast retrieval by dashboards. A single summary covers
 * one `period` bucket aligned to the `date` value.
 *
 * @example
 * ```typescript
 * const summary: WorkspaceAnalyticsSummary = {
 *   workspaceId: 'ws-acme',
 *   period: 'month',
 *   date: '2026-03-01',
 *   totalExecutions: 4800,
 *   totalTokens: 12_000_000,
 *   totalCost: 240.00,
 *   activeUsers: 18,
 *   topModels: [
 *     { model: 'claude-opus-4-6', count: 3100 },
 *     { model: 'gpt-4o',          count: 1200 },
 *   ],
 *   topTools: [
 *     { tool: 'bash',               count: 9200 },
 *     { tool: 'read_file',          count: 7800 },
 *   ],
 * };
 * ```
 */
export interface WorkspaceAnalyticsSummary {
  /** Workspace this summary covers. */
  workspaceId: string;

  /** Aggregation bucket width. */
  period: 'day' | 'week' | 'month';

  /**
   * Start date of the period in ISO 8601 date format (`YYYY-MM-DD`).
   *
   * For `'day'` this is the day; for `'week'` this is the Monday; for
   * `'month'` this is the first of the month.
   */
  date: string;

  /** Total number of agent or task executions in this period. */
  totalExecutions: number;

  /** Total tokens consumed (input + output) across all model calls. */
  totalTokens: number;

  /** Total USD cost of all model calls in this period. */
  totalCost: number;

  /** Number of distinct users who were active in this period. */
  activeUsers: number;

  /** Top models by call count, ordered descending. */
  topModels: Array<{
    /** Model identifier (e.g., `"claude-opus-4-6"`). */
    model: string;
    /** Number of calls to this model in the period. */
    count: number;
  }>;

  /** Top tools by invocation count, ordered descending. */
  topTools: Array<{
    /** Tool name (e.g., `"bash"`, `"read_file"`). */
    tool: string;
    /** Number of times this tool was invoked in the period. */
    count: number;
  }>;
}

// ============================================================================
// Usage Quota
// ============================================================================

/**
 * A usage quota applied to a workspace for a given metric and period.
 *
 * Quotas are enforced by the API Gateway. When `used` reaches `limit`,
 * further requests of that type are rejected with a 429 response until
 * the quota resets at `resetAt`.
 *
 * @example
 * ```typescript
 * const quota: WorkspaceUsageQuota = {
 *   workspaceId: 'ws-acme',
 *   quotaType: 'tokens',
 *   limit: 50_000_000,
 *   used: 12_000_000,
 *   period: 'month',
 *   resetAt: '2026-04-01T00:00:00Z',
 * };
 * ```
 */
export interface WorkspaceUsageQuota {
  /** Workspace this quota applies to. */
  workspaceId: string;

  /**
   * The metric being capped:
   * - `tokens`     — cumulative LLM tokens (input + output).
   * - `executions` — total agent/task executions.
   * - `cost`       — total USD spend (multiplied by 100 for integer storage).
   */
  quotaType: 'tokens' | 'executions' | 'cost';

  /** Maximum allowed value for the quota metric in one period. */
  limit: number;

  /** Current consumption of the quota metric in the active period. */
  used: number;

  /** Period over which the quota is measured. */
  period: 'day' | 'month';

  /** ISO 8601 timestamp when the quota counter resets to zero. */
  resetAt: string;
}
