
import { invoke } from '../lib/tauri-mock';

export interface TelemetryEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

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

export interface ToolMetrics {
  toolName: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgExecutionTimeMs: number;
  totalTimeSavedHours: number;
}

export interface TrendPoint {
  date: string;
  value: number;
}

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

export interface FeatureUsageEntry {
  featureName: string;
  usageCount: number;
  uniqueUsers: number;
  trend: string;
  lastUsed?: string;
}

export async function analyticsTrackEvent(event: TelemetryEvent): Promise<void> {
  try {
    await invoke('analytics_track_event', { event });
  } catch (error) {
    console.error('[analytics] failed to track event:', error);
    throw error;
  }
}

export async function analyticsFlushEvents(): Promise<void> {
  try {
    await invoke('analytics_flush_events');
  } catch (error) {
    console.error('[analytics] failed to flush events:', error);
    throw error;
  }
}

export async function analyticsGetSessionId(): Promise<string> {
  try {
    return await invoke<string>('analytics_get_session_id');
  } catch (error) {
    console.error('[analytics] failed to get session ID:', error);
    throw error;
  }
}

export async function analyticsSetUserProperty(key: string, value: unknown): Promise<void> {
  try {
    await invoke('analytics_set_user_property', { key, value });
  } catch (error) {
    console.error('[analytics] failed to set user property:', error);
    throw error;
  }
}

export async function analyticsSetPrivacyMode(mode: string): Promise<void> {
  try {
    await invoke('analytics_set_privacy_mode', { mode });
  } catch (error) {
    console.error('[analytics] failed to set privacy mode:', error);
  }
}

export async function analyticsDeleteAllData(): Promise<void> {
  try {
    await invoke('analytics_delete_all_data');
  } catch (error) {
    console.error('[analytics] failed to delete all data:', error);
    throw error;
  }
}

export async function metricsGetSystem(): Promise<SystemMetrics> {
  try {
    return await invoke<SystemMetrics>('metrics_get_system');
  } catch (error) {
    console.error('[analytics] failed to get system metrics:', error);
    throw error;
  }
}

export async function metricsGetApp(): Promise<AppMetrics> {
  try {
    return await invoke<AppMetrics>('metrics_get_app');
  } catch (error) {
    console.error('[analytics] failed to get app metrics:', error);
    throw error;
  }
}

export async function metricsIncrementAutomations(): Promise<void> {
  try {
    await invoke('metrics_increment_automations');
  } catch (error) {
    console.error('[analytics] failed to increment automations metric:', error);
    throw error;
  }
}

export async function metricsIncrementGoals(): Promise<void> {
  try {
    await invoke('metrics_increment_goals');
  } catch (error) {
    console.error('[analytics] failed to increment goals metric:', error);
    throw error;
  }
}

export async function metricsSetMcpServers(count: number): Promise<void> {
  try {
    await invoke('metrics_set_mcp_servers', { count });
  } catch (error) {
    console.error('[analytics] failed to set MCP servers metric:', error);
    throw error;
  }
}

export async function metricsSetCacheHitRate(rate: number): Promise<void> {
  try {
    await invoke('metrics_set_cache_hit_rate', { rate });
  } catch (error) {
    console.error('[analytics] failed to set cache hit rate metric:', error);
    throw error;
  }
}

export async function analyticsGetUsageStats(): Promise<UsageStats> {
  try {
    return await invoke<UsageStats>('analytics_get_usage_stats');
  } catch (error) {
    console.error('[analytics] failed to get usage stats:', error);
    throw error;
  }
}

export async function analyticsGetFeatureUsage(): Promise<FeatureUsageEntry[]> {
  try {
    return await invoke<FeatureUsageEntry[]>('analytics_get_feature_usage');
  } catch (error) {
    console.error('[analytics] failed to get feature usage:', error);
    throw error;
  }
}

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

export async function analyticsGetTimeSavedTrend(days: number): Promise<TrendPoint[]> {
  try {
    return await invoke<TrendPoint[]>('analytics_get_time_saved_trend', { days });
  } catch (error) {
    console.error('[analytics] failed to get time saved trend:', error);
    throw error;
  }
}

export async function analyticsGetCostSavedTrend(days: number): Promise<TrendPoint[]> {
  try {
    return await invoke<TrendPoint[]>('analytics_get_cost_saved_trend', { days });
  } catch (error) {
    console.error('[analytics] failed to get cost saved trend:', error);
    throw error;
  }
}

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

export async function analyticsGenerateWeeklyReport(): Promise<string> {
  try {
    return await invoke<string>('analytics_generate_weekly_report');
  } catch (error) {
    console.error('[analytics] failed to generate weekly report:', error);
    throw error;
  }
}

export async function analyticsGenerateMonthlyReport(): Promise<string> {
  try {
    return await invoke<string>('analytics_generate_monthly_report');
  } catch (error) {
    console.error('[analytics] failed to generate monthly report:', error);
    throw error;
  }
}

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

export async function trackWorkflowView(workflowId: string): Promise<void> {
  try {
    await invoke('track_workflow_view', { workflowId });
  } catch (error) {
    console.error('[analytics] failed to track workflow view:', error);
    throw error;
  }
}

export async function acknowledgeMilestone(milestoneId: string): Promise<void> {
  try {
    await invoke('acknowledge_milestone', { milestoneId });
  } catch (error) {
    console.error('[analytics] failed to acknowledge milestone:', error);
    throw error;
  }
}

export const AnalyticsClient = {
  trackEvent: analyticsTrackEvent,
  flushEvents: analyticsFlushEvents,
  getSessionId: analyticsGetSessionId,
  setUserProperty: analyticsSetUserProperty,
  deleteAllData: analyticsDeleteAllData,
  getSystemMetrics: metricsGetSystem,
  getAppMetrics: metricsGetApp,
  incrementAutomations: metricsIncrementAutomations,
  incrementGoals: metricsIncrementGoals,
  setMcpServers: metricsSetMcpServers,
  setCacheHitRate: metricsSetCacheHitRate,
  getUsageStats: analyticsGetUsageStats,
  getFeatureUsage: analyticsGetFeatureUsage,
  calculateRoi: analyticsCalculateRoi,
  getProcessMetrics: analyticsGetProcessMetrics,
  getUserMetrics: analyticsGetUserMetrics,
  getToolMetrics: analyticsGetToolMetrics,
  getMetricTrends: analyticsGetMetricTrends,
  getTimeSavedTrend: analyticsGetTimeSavedTrend,
  getCostSavedTrend: analyticsGetCostSavedTrend,
  exportReport: analyticsExportReport,
  generateWeeklyReport: analyticsGenerateWeeklyReport,
  generateMonthlyReport: analyticsGenerateMonthlyReport,
  saveSnapshot: analyticsSaveSnapshot,
  getTopProcesses: analyticsGetTopProcesses,
  trackWorkflowView,
  acknowledgeMilestone,
} as const;
