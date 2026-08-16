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
 *   eventName: `${selectedModel.id}/chat`,
 *   metadata: { inputTokens: 1200, outputTokens: 340, costUsd: 0.048 },
 *   timestamp: '2026-03-19T10:00:00Z',
 * };
 * ```
 */
export interface WorkspaceAnalyticsEvent {
  id: string;

  workspaceId: string;

  userId: string;

  eventType: 'agent_execution' | 'tool_usage' | 'model_call' | 'user_action';

  eventName: string;

  metadata: Record<string, unknown>;

  timestamp: string;
}

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
 *   topModels: topCatalogModels.map(({ id: model, count }) => ({ model, count })),
 *   topTools: [
 *     { tool: 'bash',               count: 9200 },
 *     { tool: 'read_file',          count: 7800 },
 *   ],
 * };
 * ```
 */
export interface WorkspaceAnalyticsSummary {
  workspaceId: string;

  period: 'day' | 'week' | 'month';

  date: string;

  totalExecutions: number;

  totalTokens: number;

  totalCost: number;

  activeUsers: number;

  topModels: Array<{
    model: string;
    count: number;
  }>;

  topTools: Array<{
    tool: string;
    count: number;
  }>;
}

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
  workspaceId: string;

  quotaType: 'tokens' | 'executions' | 'cost';

  limit: number;

  used: number;

  period: 'day' | 'month';

  resetAt: string;
}
