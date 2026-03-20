/**
 * Analytics & Metrics API — typed wrappers for analytics_*, metrics_*, and feature_flag_* commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
}
export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  uptime: number;
}
export interface AppMetrics {
  activeConversations: number;
  totalMessages: number;
  automationsRun: number;
  mcpServers: number;
  cacheHitRate: number;
}
export interface ROIReport {
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  processesOptimized: number;
}
export interface ProcessMetrics {
  name: string;
  runs: number;
  avgDuration: number;
  successRate: number;
  timeSaved: number;
}
export interface UserMetrics {
  userId: string;
  actions: number;
  automationsRun: number;
  timeSaved: number;
}
export interface ToolMetrics {
  toolName: string;
  calls: number;
  avgDuration: number;
  successRate: number;
}
export interface TrendPoint {
  timestamp: number;
  value: number;
}
export interface RealtimeStats {
  activeUsers: number;
  runningAutomations: number;
  pendingTasks: number;
  messagesPerMinute: number;
}
export interface RecordAutomationRequest {
  automationType: string;
  durationMs: number;
  success: boolean;
  [key: string]: unknown;
}
export interface MetricsSnapshot {
  timestamp: string;
  automations: number;
  timeSaved: number;
  costSaved: number;
}
export interface Comparison {
  manual: number;
  automated: number;
  savings: number;
}
export interface PeriodComparison {
  current: MetricsSnapshot;
  previous: MetricsSnapshot;
  changePercent: number;
}
export interface BenchmarkComparison {
  yours: number;
  industry: number;
  percentile: number;
}
export interface MilestoneData {
  id: string;
  name: string;
  achieved: boolean;
  achievedAt?: string;
}
export interface DayStats {
  automations: number;
  timeSaved: number;
  messages: number;
}
export interface WeekStats {
  automations: number;
  timeSaved: number;
  messages: number;
  trend: number;
}
export interface MonthStats {
  automations: number;
  timeSaved: number;
  costSaved: number;
}
export interface AllTimeStats {
  automations: number;
  timeSaved: number;
  costSaved: number;
  messages: number;
}
export interface ComparisonData {
  manual: number;
  automated: number;
  savings: number;
}
export interface PeriodComparisonData {
  current: number;
  previous: number;
  change: number;
}
export interface BenchmarkComparisonData {
  yours: number;
  benchmark: number;
  percentile: number;
}
export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}
export interface ExportOptions {
  format: string;
  startDate?: number;
  endDate?: number;
}

// ---- Analytics ----

export async function analyticsTrackEvent(event: TelemetryEvent): Promise<void> {
  return command<void>('analytics_track_event', { event });
}
export async function analyticsFlushEvents(): Promise<void> {
  return command<void>('analytics_flush_events');
}
export async function analyticsGetSessionId(): Promise<string> {
  return command<string>('analytics_get_session_id');
}
export async function analyticsSetUserProperty(key: string, value: unknown): Promise<void> {
  return command<void>('analytics_set_user_property', { key, value });
}
export async function analyticsDeleteAllData(): Promise<void> {
  return command<void>('analytics_delete_all_data');
}
export async function analyticsGetUsageStats(): Promise<unknown> {
  return command<unknown>('analytics_get_usage_stats');
}
export async function analyticsGetFeatureUsage(): Promise<unknown[]> {
  return command<unknown[]>('analytics_get_feature_usage');
}
export async function analyticsCalculateRoi(
  startDate: number,
  endDate: number,
): Promise<ROIReport> {
  return command<ROIReport>('analytics_calculate_roi', { startDate, endDate });
}
export async function analyticsGetProcessMetrics(
  startDate: number,
  endDate: number,
): Promise<ProcessMetrics[]> {
  return command<ProcessMetrics[]>('analytics_get_process_metrics', { startDate, endDate });
}
export async function analyticsGetUserMetrics(
  startDate: number,
  endDate: number,
): Promise<UserMetrics[]> {
  return command<UserMetrics[]>('analytics_get_user_metrics', { startDate, endDate });
}
export async function analyticsGetToolMetrics(
  startDate: number,
  endDate: number,
): Promise<ToolMetrics[]> {
  return command<ToolMetrics[]>('analytics_get_tool_metrics', { startDate, endDate });
}
export async function analyticsGetMetricTrends(
  metric: string,
  days: number,
): Promise<TrendPoint[]> {
  return command<TrendPoint[]>('analytics_get_metric_trends', { metric, days });
}
export async function analyticsGetTimeSavedTrend(days: number): Promise<TrendPoint[]> {
  return command<TrendPoint[]>('analytics_get_time_saved_trend', { days });
}
export async function analyticsGetCostSavedTrend(days: number): Promise<TrendPoint[]> {
  return command<TrendPoint[]>('analytics_get_cost_saved_trend', { days });
}
export async function analyticsExportReport(
  format: string,
  startDate: number,
  endDate: number,
): Promise<string> {
  return command<string>('analytics_export_report', { format, startDate, endDate });
}
export async function analyticsGenerateWeeklyReport(): Promise<string> {
  return command<string>('analytics_generate_weekly_report');
}
export async function analyticsGenerateMonthlyReport(): Promise<string> {
  return command<string>('analytics_generate_monthly_report');
}
export async function analyticsGetTopProcesses(
  startDate: number,
  endDate: number,
  limit: number,
): Promise<ProcessMetrics[]> {
  return command<ProcessMetrics[]>('analytics_get_top_processes', { startDate, endDate, limit });
}
export async function analyticsSaveSnapshot(
  startDate: number,
  endDate: number,
  teamId?: string,
): Promise<string> {
  return command<string>('analytics_save_snapshot', { teamId, startDate, endDate });
}
export async function trackWorkflowView(workflowId: string): Promise<void> {
  return command<void>('track_workflow_view', { workflowId });
}
export async function acknowledgeMilestone(milestoneId: string): Promise<void> {
  return command<void>('acknowledge_milestone', { milestoneId });
}

// ---- System/App Metrics ----

export async function metricsGetSystem(): Promise<SystemMetrics> {
  return command<SystemMetrics>('metrics_get_system');
}
export async function metricsGetApp(): Promise<AppMetrics> {
  return command<AppMetrics>('metrics_get_app');
}
export async function metricsIncrementAutomations(): Promise<void> {
  return command<void>('metrics_increment_automations');
}
export async function metricsIncrementGoals(): Promise<void> {
  return command<void>('metrics_increment_goals');
}
export async function metricsSetMcpServers(count: number): Promise<void> {
  return command<void>('metrics_set_mcp_servers', { count });
}
export async function metricsSetCacheHitRate(rate: number): Promise<void> {
  return command<void>('metrics_set_cache_hit_rate', { rate });
}

// ---- Feature Flags ----

export async function featureFlagGet(flagName: string): Promise<boolean> {
  return command<boolean>('feature_flag_get', { flagName });
}
export async function featureFlagGetAll(): Promise<Record<string, boolean>> {
  return command<Record<string, boolean>>('feature_flag_get_all');
}

// ---- ROI / Comparison Metrics ----

export async function getRealtimeStats(): Promise<RealtimeStats> {
  return command<RealtimeStats>('get_realtime_stats');
}
export async function recordAutomationMetrics(
  request: RecordAutomationRequest,
): Promise<MetricsSnapshot> {
  return command<MetricsSnapshot>('record_automation_metrics', { request });
}
export async function getMetricsHistory(days: number): Promise<MetricsSnapshot[]> {
  return command<MetricsSnapshot[]>('get_metrics_history', { days });
}
export async function compareToManual(automationType: string): Promise<Comparison> {
  return command<Comparison>('compare_to_manual', { automationType });
}
export async function compareToPreviousPeriod(days: number): Promise<PeriodComparison> {
  return command<PeriodComparison>('compare_to_previous_period', { days });
}
export async function compareToIndustryBenchmark(role: string): Promise<BenchmarkComparison> {
  return command<BenchmarkComparison>('compare_to_industry_benchmark', { role });
}
export async function getMilestones(): Promise<MilestoneData[]> {
  return command<MilestoneData[]>('get_milestones');
}
export async function shareMilestone(milestoneId: string): Promise<void> {
  return command<void>('share_milestone', { milestoneId });
}
export async function getTodayStats(): Promise<DayStats> {
  return command<DayStats>('get_today_stats');
}
export async function getWeekStats(): Promise<WeekStats> {
  return command<WeekStats>('get_week_stats');
}
export async function getMonthStats(): Promise<MonthStats> {
  return command<MonthStats>('get_month_stats');
}
export async function getAllTimeStats(): Promise<AllTimeStats> {
  return command<AllTimeStats>('get_all_time_stats');
}
export async function getManualVsAutomatedComparison(
  automationType: string,
): Promise<ComparisonData> {
  return command<ComparisonData>('get_manual_vs_automated_comparison', { automationType });
}
export async function getPeriodComparison(period: string): Promise<PeriodComparisonData> {
  return command<PeriodComparisonData>('get_period_comparison', { period });
}
export async function getBenchmarkComparison(role: string): Promise<BenchmarkComparisonData> {
  return command<BenchmarkComparisonData>('get_benchmark_comparison', { role });
}
export async function getRecentActivity(limit: number): Promise<ActivityItem[]> {
  return command<ActivityItem[]>('get_recent_activity', { limit });
}
export async function exportRoiReport(options: ExportOptions): Promise<string> {
  return command<string>('export_roi_report', { options });
}
