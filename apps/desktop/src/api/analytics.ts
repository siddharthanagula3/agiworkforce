/**
 * Analytics API
 *
 * TypeScript wrappers for ALL Tauri commands defined in
 * `apps/desktop/src-tauri/src/sys/commands/analytics.rs`.
 *
 * 29 commands total:
 *   Telemetry (6): track, flush, session-id, set-user-property, delete-all, get-session-id
 *   System/App metrics (6): get-system, get-app, increment-automations, increment-goals,
 *                            set-mcp-servers, set-cache-hit-rate
 *   Feature flags (2): get, get-all
 *   Usage & feature analytics (2): get-usage-stats, get-feature-usage
 *   ROI & aggregation (5): calculate-roi, process-metrics, user-metrics, tool-metrics, metric-trends
 *   Trend aliases (2): time-saved-trend, cost-saved-trend
 *   Reports (4): export-report, weekly-report, monthly-report, save-snapshot
 *   Top processes (1): get-top-processes
 *   Event tracking (2): track-workflow-view, acknowledge-milestone
 *
 * Convention: invoke() params are camelCase, command names are snake_case.
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// Types — mirroring Rust structs from analytics.rs, telemetry/, data/analytics/
// ============================================================================

/** Matches Rust `TelemetryEvent` in sys/telemetry/collector.rs */
export interface TelemetryEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

/** Matches Rust `SystemMetrics` in sys/telemetry/analytics_metrics.rs */
export interface SystemMetrics {
  cpuUsage: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeSeconds: number;
}

/** Matches Rust `AppMetrics` in sys/telemetry/analytics_metrics.rs */
export interface AppMetrics {
  automationsCount: number;
  goalsCount: number;
  mcpServersCount: number;
  cacheHitRate: number;
  avgGoalDurationMs: number;
  activeSessions: number;
  totalApiCalls: number;
  failedOperations: number;
}

/** Matches Rust `ROIReport` in data/analytics/roi_calculator.rs */
export interface ROIReport {
  timeSavedHours: number;
  costSavingsUsd: number;
  errorReductionPercent: number;
  productivityGainPercent: number;
  totalAutomations: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTimeMs: number;
  totalLlmCostUsd: number;
  llmCostSavedUsd: number;
  reportStartDate: number;
  reportEndDate: number;
}

/** Matches Rust `ProcessMetrics` in data/analytics/metrics_aggregator.rs */
export interface ProcessMetrics {
  processType: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  timeSavedHours: number;
  costSavingsUsd: number;
  errorRate: number;
}

/** Matches Rust `UserMetrics` in data/analytics/metrics_aggregator.rs */
export interface UserMetrics {
  userId: string;
  automationCount: number;
  goalCount: number;
  timeSavedHours: number;
  costSavingsUsd: number;
  mostUsedTool: string;
  mostUsedProcess: string;
  avgSuccessRate: number;
}

/** Matches Rust `ToolMetrics` in data/analytics/metrics_aggregator.rs */
export interface ToolMetrics {
  toolName: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgExecutionTimeMs: number;
  totalTimeSavedHours: number;
}

/** Matches Rust `TrendPoint` in data/analytics/metrics_aggregator.rs */
export interface TrendPoint {
  date: string;
  value: number;
}

/** Usage stats returned by analytics_get_usage_stats (JSON value) */
export interface UsageStats {
  dau: number;
  mau: number;
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  avgSessionDurationMs: number;
  totalEvents: number;
  eventsToday: number;
  retentionRate: number;
}

/** Feature usage stats returned by analytics_get_feature_usage */
export interface FeatureUsageEntry {
  featureName: string;
  usageCount: number;
  uniqueUsers: number;
  trend: string;
  lastUsed?: string;
}

// ============================================================================
// 1. Telemetry Commands
// ============================================================================

/** Track a single telemetry event. */
export async function analyticsTrackEvent(event: TelemetryEvent): Promise<void> {
  try {
    await invoke('analytics_track_event', { event });
  } catch (error) {
    console.error('[analytics] failed to track event:', error);
    throw error;
  }
}

/** Flush queued telemetry events to storage/backend. */
export async function analyticsFlushEvents(): Promise<void> {
  try {
    await invoke('analytics_flush_events');
  } catch (error) {
    console.error('[analytics] failed to flush events:', error);
    throw error;
  }
}

/** Get the current analytics session ID. */
export async function analyticsGetSessionId(): Promise<string> {
  try {
    return await invoke<string>('analytics_get_session_id');
  } catch (error) {
    console.error('[analytics] failed to get session ID:', error);
    throw error;
  }
}

/** Set a user property for analytics segmentation. */
export async function analyticsSetUserProperty(key: string, value: unknown): Promise<void> {
  try {
    await invoke('analytics_set_user_property', { key, value });
  } catch (error) {
    console.error('[analytics] failed to set user property:', error);
    throw error;
  }
}

/** Delete all locally stored analytics data (GDPR). */
export async function analyticsDeleteAllData(): Promise<void> {
  try {
    await invoke('analytics_delete_all_data');
  } catch (error) {
    console.error('[analytics] failed to delete all data:', error);
    throw error;
  }
}

// ============================================================================
// 2. System & App Metrics Commands
// ============================================================================

/** Collect current system metrics (CPU, memory, disk, network). */
export async function metricsGetSystem(): Promise<SystemMetrics> {
  try {
    return await invoke<SystemMetrics>('metrics_get_system');
  } catch (error) {
    console.error('[analytics] failed to get system metrics:', error);
    throw error;
  }
}

/** Collect current app-level metrics (automations, goals, MCP, cache). */
export async function metricsGetApp(): Promise<AppMetrics> {
  try {
    return await invoke<AppMetrics>('metrics_get_app');
  } catch (error) {
    console.error('[analytics] failed to get app metrics:', error);
    throw error;
  }
}

/** Increment the automations counter in app metrics. */
export async function metricsIncrementAutomations(): Promise<void> {
  try {
    await invoke('metrics_increment_automations');
  } catch (error) {
    console.error('[analytics] failed to increment automations metric:', error);
    throw error;
  }
}

/** Increment the goals counter in app metrics. */
export async function metricsIncrementGoals(): Promise<void> {
  try {
    await invoke('metrics_increment_goals');
  } catch (error) {
    console.error('[analytics] failed to increment goals metric:', error);
    throw error;
  }
}

/** Set the MCP servers count in app metrics. */
export async function metricsSetMcpServers(count: number): Promise<void> {
  try {
    await invoke('metrics_set_mcp_servers', { count });
  } catch (error) {
    console.error('[analytics] failed to set MCP servers metric:', error);
    throw error;
  }
}

/** Set the cache hit rate in app metrics. */
export async function metricsSetCacheHitRate(rate: number): Promise<void> {
  try {
    await invoke('metrics_set_cache_hit_rate', { rate });
  } catch (error) {
    console.error('[analytics] failed to set cache hit rate metric:', error);
    throw error;
  }
}

// ============================================================================
// 3. Feature Flag Commands
// ============================================================================

/** Get a single feature flag value by name. */
export async function featureFlagGet(flagName: string): Promise<boolean> {
  try {
    return await invoke<boolean>('feature_flag_get', { flagName });
  } catch (error) {
    console.error('[analytics] failed to get feature flag:', error);
    throw error;
  }
}

/** Get all feature flags as a map of name to enabled state. */
export async function featureFlagGetAll(): Promise<Record<string, boolean>> {
  try {
    return await invoke<Record<string, boolean>>('feature_flag_get_all');
  } catch (error) {
    console.error('[analytics] failed to get all feature flags:', error);
    throw error;
  }
}

// ============================================================================
// 4. Usage & Feature Analytics Commands
// ============================================================================

/** Get aggregated usage statistics (DAU, MAU, session duration, etc). */
export async function analyticsGetUsageStats(): Promise<UsageStats> {
  try {
    return await invoke<UsageStats>('analytics_get_usage_stats');
  } catch (error) {
    console.error('[analytics] failed to get usage stats:', error);
    throw error;
  }
}

/** Get per-feature usage breakdown. */
export async function analyticsGetFeatureUsage(): Promise<FeatureUsageEntry[]> {
  try {
    return await invoke<FeatureUsageEntry[]>('analytics_get_feature_usage');
  } catch (error) {
    console.error('[analytics] failed to get feature usage:', error);
    throw error;
  }
}

// ============================================================================
// 5. ROI & Aggregation Commands
// ============================================================================

/** Calculate ROI report for a date range (epoch timestamps). */
export async function analyticsCalculateRoi(
  startDate: number,
  endDate: number,
): Promise<ROIReport> {
  try {
    return await invoke<ROIReport>('analytics_calculate_roi', { startDate, endDate });
  } catch (error) {
    console.error('[analytics] failed to calculate ROI:', error);
    throw error;
  }
}

/** Get process-type-level metrics for a date range. */
export async function analyticsGetProcessMetrics(
  startDate: number,
  endDate: number,
): Promise<ProcessMetrics[]> {
  try {
    return await invoke<ProcessMetrics[]>('analytics_get_process_metrics', {
      startDate,
      endDate,
    });
  } catch (error) {
    console.error('[analytics] failed to get process metrics:', error);
    throw error;
  }
}

/** Get user-level metrics for a date range. */
export async function analyticsGetUserMetrics(
  startDate: number,
  endDate: number,
): Promise<UserMetrics[]> {
  try {
    return await invoke<UserMetrics[]>('analytics_get_user_metrics', { startDate, endDate });
  } catch (error) {
    console.error('[analytics] failed to get user metrics:', error);
    throw error;
  }
}

/** Get tool-level metrics for a date range. */
export async function analyticsGetToolMetrics(
  startDate: number,
  endDate: number,
): Promise<ToolMetrics[]> {
  try {
    return await invoke<ToolMetrics[]>('analytics_get_tool_metrics', { startDate, endDate });
  } catch (error) {
    console.error('[analytics] failed to get tool metrics:', error);
    throw error;
  }
}

/** Get trend data for a specific metric over N days. */
export async function analyticsGetMetricTrends(
  metric: string,
  days: number,
): Promise<TrendPoint[]> {
  try {
    return await invoke<TrendPoint[]>('analytics_get_metric_trends', { metric, days });
  } catch (error) {
    console.error('[analytics] failed to get metric trends:', error);
    throw error;
  }
}

// ============================================================================
// 6. Trend Alias Commands
// ============================================================================

/** Get time-saved trend for N days (alias for metric_trends("time_saved")). */
export async function analyticsGetTimeSavedTrend(days: number): Promise<TrendPoint[]> {
  try {
    return await invoke<TrendPoint[]>('analytics_get_time_saved_trend', { days });
  } catch (error) {
    console.error('[analytics] failed to get time saved trend:', error);
    throw error;
  }
}

/** Get cost-saved trend for N days (alias for metric_trends("cost_saved")). */
export async function analyticsGetCostSavedTrend(days: number): Promise<TrendPoint[]> {
  try {
    return await invoke<TrendPoint[]>('analytics_get_cost_saved_trend', { days });
  } catch (error) {
    console.error('[analytics] failed to get cost saved trend:', error);
    throw error;
  }
}

// ============================================================================
// 7. Report Commands
// ============================================================================

/** Export a formatted analytics report. Format: 'markdown' | 'csv' | 'json'. */
export async function analyticsExportReport(
  format: string,
  startDate: number,
  endDate: number,
): Promise<string> {
  try {
    return await invoke<string>('analytics_export_report', { format, startDate, endDate });
  } catch (error) {
    console.error('[analytics] failed to export report:', error);
    throw error;
  }
}

/** Generate a weekly analytics report for the current user. */
export async function analyticsGenerateWeeklyReport(): Promise<string> {
  try {
    return await invoke<string>('analytics_generate_weekly_report');
  } catch (error) {
    console.error('[analytics] failed to generate weekly report:', error);
    throw error;
  }
}

/** Generate a monthly analytics report for the current user. */
export async function analyticsGenerateMonthlyReport(): Promise<string> {
  try {
    return await invoke<string>('analytics_generate_monthly_report');
  } catch (error) {
    console.error('[analytics] failed to generate monthly report:', error);
    throw error;
  }
}

/** Save a snapshot of the current ROI data. */
export async function analyticsSaveSnapshot(
  startDate: number,
  endDate: number,
  teamId?: string,
): Promise<string> {
  try {
    return await invoke<string>('analytics_save_snapshot', { startDate, endDate, teamId });
  } catch (error) {
    console.error('[analytics] failed to save snapshot:', error);
    throw error;
  }
}

// ============================================================================
// 8. Top Processes Command
// ============================================================================

/** Get top N processes by execution count for a date range. */
export async function analyticsGetTopProcesses(
  startDate: number,
  endDate: number,
  limit: number,
): Promise<ProcessMetrics[]> {
  try {
    return await invoke<ProcessMetrics[]>('analytics_get_top_processes', {
      startDate,
      endDate,
      limit,
    });
  } catch (error) {
    console.error('[analytics] failed to get top processes:', error);
    throw error;
  }
}

// ============================================================================
// 9. Event Tracking Commands
// ============================================================================

/** Track a workflow view event. */
export async function trackWorkflowView(workflowId: string): Promise<void> {
  try {
    await invoke('track_workflow_view', { workflowId });
  } catch (error) {
    console.error('[analytics] failed to track workflow view:', error);
    throw error;
  }
}

/** Acknowledge a milestone achievement. */
export async function acknowledgeMilestone(milestoneId: string): Promise<void> {
  try {
    await invoke('acknowledge_milestone', { milestoneId });
  } catch (error) {
    console.error('[analytics] failed to acknowledge milestone:', error);
    throw error;
  }
}

// ============================================================================
// Static Client (optional class-based access)
// ============================================================================

/** Convenience class grouping all analytics API functions. */
export const AnalyticsClient = {
  // Telemetry
  trackEvent: analyticsTrackEvent,
  flushEvents: analyticsFlushEvents,
  getSessionId: analyticsGetSessionId,
  setUserProperty: analyticsSetUserProperty,
  deleteAllData: analyticsDeleteAllData,
  // System/App Metrics
  getSystemMetrics: metricsGetSystem,
  getAppMetrics: metricsGetApp,
  incrementAutomations: metricsIncrementAutomations,
  incrementGoals: metricsIncrementGoals,
  setMcpServers: metricsSetMcpServers,
  setCacheHitRate: metricsSetCacheHitRate,
  // Feature Flags
  getFeatureFlag: featureFlagGet,
  getAllFeatureFlags: featureFlagGetAll,
  // Usage & Feature Analytics
  getUsageStats: analyticsGetUsageStats,
  getFeatureUsage: analyticsGetFeatureUsage,
  // ROI & Aggregation
  calculateRoi: analyticsCalculateRoi,
  getProcessMetrics: analyticsGetProcessMetrics,
  getUserMetrics: analyticsGetUserMetrics,
  getToolMetrics: analyticsGetToolMetrics,
  getMetricTrends: analyticsGetMetricTrends,
  // Trend Aliases
  getTimeSavedTrend: analyticsGetTimeSavedTrend,
  getCostSavedTrend: analyticsGetCostSavedTrend,
  // Reports
  exportReport: analyticsExportReport,
  generateWeeklyReport: analyticsGenerateWeeklyReport,
  generateMonthlyReport: analyticsGenerateMonthlyReport,
  saveSnapshot: analyticsSaveSnapshot,
  // Top Processes
  getTopProcesses: analyticsGetTopProcesses,
  // Event Tracking
  trackWorkflowView,
  acknowledgeMilestone,
} as const;
