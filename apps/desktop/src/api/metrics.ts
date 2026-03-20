/**
 * Metrics API
 *
 * TypeScript wrappers for the metrics and ROI dashboard Tauri commands.
 * Provides real-time stats, historical metrics, comparisons, milestones,
 * and report export functionality.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** Request to record an automation run */
export interface RecordAutomationRequest {
  employeeId?: string;
  automationName: string;
  estimatedManualTimeMs: number;
  actualExecutionTimeMs: number;
  tasksCompleted?: number;
  errorsPrevented?: number;
  qualityScore?: number;
}

/** Snapshot of metrics at a point in time */
export interface MetricsSnapshot {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  totalAutomationsRun: number;
  avgTimeSavedPerRun: number;
}

/** Real-time stats across time periods */
export interface RealtimeStats {
  today: MetricsSnapshot;
  thisWeek: MetricsSnapshot;
  thisMonth: MetricsSnapshot;
  allTime: MetricsSnapshot;
}

/** Comparison between manual and automated processes */
export interface Comparison {
  manualTimeMinutes: number;
  automatedTimeMinutes: number;
  manualCostUsd: number;
  automatedCostUsd: number;
  manualErrorRate: number;
  automatedErrorRate: number;
  timeSavedMinutes: number;
  costSavedUsd: number;
  qualityImprovementPercent: number;
}

/** Comparison between two time periods */
export interface PeriodComparison {
  current: MetricsSnapshot;
  previous: MetricsSnapshot;
  timeSavedChangePercent: number;
}

/** Comparison against industry benchmark */
export interface BenchmarkComparison {
  userTimeSaved: number;
  industryAvgTimeSaved: number;
  userCostSaved: number;
  industryAvgCostSaved: number;
  aboveAverage: boolean;
  percentile: number;
}

/** Milestone achievement data */
export interface MilestoneData {
  id: string;
  milestoneType: string;
  thresholdValue: number;
  achievedAt: number;
  shared: boolean;
}

/** Stats for a single day */
export interface DayStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromYesterday: number;
  topEmployee: string;
  topEmployeeTimeSaved: number;
}

/** Top performing employee data */
export interface TopEmployeeData {
  employeeId: string;
  employeeName: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  successRate: number;
}

/** Daily breakdown entry */
export interface DailyBreakdown {
  date: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

/** Stats for the current week */
export interface WeekStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastWeek: number;
  topEmployees: TopEmployeeData[];
  dailyBreakdown: DailyBreakdown[];
}

/** Weekly breakdown entry */
export interface WeeklyBreakdown {
  weekStart: string;
  weekEnd: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

/** Stats for the current month */
export interface MonthStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastMonth: number;
  topEmployees: TopEmployeeData[];
  weeklyBreakdown: WeeklyBreakdown[];
}

/** Monthly trend entry */
export interface MonthlyTrend {
  month: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

/** All-time stats with milestones and trends */
export interface AllTimeStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  milestonesAchieved: number;
  topEmployees: TopEmployeeData[];
  monthlyTrend: MonthlyTrend[];
}

/** Manual vs automated comparison data */
export interface ComparisonData {
  manualTimeHours: number;
  automatedTimeHours: number;
  manualCostUsd: number;
  automatedCostUsd: number;
  manualQuality: number;
  automatedQuality: number;
  timeSavedHours: number;
  costSavedUsd: number;
  efficiencyGain: number;
  qualityImprovement: number;
}

/** Period-over-period comparison data */
export interface PeriodComparisonData {
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  currentTimeSavedHours: number;
  previousTimeSavedHours: number;
  currentCostSavedUsd: number;
  previousCostSavedUsd: number;
  currentAutomationsRun: number;
  previousAutomationsRun: number;
  percentageChange: number;
}

/** Industry benchmark comparison data */
export interface BenchmarkComparisonData {
  yourTimeSavedHours: number;
  industryAverageTimeSavedHours: number;
  yourCostSavedUsd: number;
  industryAverageCostSavedUsd: number;
  yourAutomationsRun: number;
  industryAverageAutomationsRun: number;
  percentageBetter: number;
}

/** Recent activity feed item */
export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: number;
  timeSavedMinutes?: number;
  costSavedUsd?: number;
  employeeName?: string;
  automationName?: string;
  status?: string;
}

/** Options for exporting an ROI report */
export interface ExportOptions {
  dateRange: string;
  format: string;
  includeCharts: boolean;
  includeDetailedLog: boolean;
  includeComparison: boolean;
  includeEmployeeBreakdown: boolean;
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/** Get real-time metrics stats */
export async function getRealtimeStats(): Promise<RealtimeStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<RealtimeStats>('get_realtime_stats');
  } catch (error) {
    console.error('[metrics] failed to get realtime stats', error);
    throw error;
  }
}

/** Record an automation run and get updated snapshot */
export async function recordAutomationMetrics(
  request: RecordAutomationRequest,
): Promise<MetricsSnapshot> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MetricsSnapshot>('record_automation_metrics', {
      request,
    });
  } catch (error) {
    console.error('[metrics] failed to record automation metrics', error);
    throw error;
  }
}

/** Get metrics history for a given number of days */
export async function getMetricsHistory(days: number): Promise<MetricsSnapshot[]> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MetricsSnapshot[]>('get_metrics_history', { days });
  } catch (error) {
    console.error('[metrics] failed to get metrics history', error);
    throw error;
  }
}

/** Compare automated vs manual for a given automation type */
export async function compareToManual(automationType: string): Promise<Comparison> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<Comparison>('compare_to_manual', { automationType });
  } catch (error) {
    console.error('[metrics] failed to compare to manual', error);
    throw error;
  }
}

/** Compare current period with previous period */
export async function compareToPreviousPeriod(days: number): Promise<PeriodComparison> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<PeriodComparison>('compare_to_previous_period', { days });
  } catch (error) {
    console.error('[metrics] failed to compare to previous period', error);
    throw error;
  }
}

/** Compare to industry benchmark for a given role */
export async function compareToIndustryBenchmark(role: string): Promise<BenchmarkComparison> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<BenchmarkComparison>('compare_to_industry_benchmark', { role });
  } catch (error) {
    console.error('[metrics] failed to compare to industry benchmark', error);
    throw error;
  }
}

/** Get list of achieved milestones */
export async function getMilestones(): Promise<MilestoneData[]> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MilestoneData[]>('get_milestones');
  } catch (error) {
    console.error('[metrics] failed to get milestones', error);
    throw error;
  }
}

/** Share a milestone (mark as publicly visible) */
export async function shareMilestone(milestoneId: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    await invoke<void>('share_milestone', { milestoneId });
  } catch (error) {
    console.error('[metrics] failed to share milestone', error);
    throw error;
  }
}

/** Get today's stats summary */
export async function getTodayStats(): Promise<DayStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<DayStats>('get_today_stats');
  } catch (error) {
    console.error('[metrics] failed to get today stats', error);
    throw error;
  }
}

/** Get this week's stats with daily breakdown */
export async function getWeekStats(): Promise<WeekStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<WeekStats>('get_week_stats');
  } catch (error) {
    console.error('[metrics] failed to get week stats', error);
    throw error;
  }
}

/** Get this month's stats with weekly breakdown */
export async function getMonthStats(): Promise<MonthStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MonthStats>('get_month_stats');
  } catch (error) {
    console.error('[metrics] failed to get month stats', error);
    throw error;
  }
}

/** Get all-time stats with monthly trends */
export async function getAllTimeStats(): Promise<AllTimeStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<AllTimeStats>('get_all_time_stats');
  } catch (error) {
    console.error('[metrics] failed to get all time stats', error);
    throw error;
  }
}

/** Get manual vs automated comparison for an automation type */
export async function getManualVsAutomatedComparison(
  automationType: string,
): Promise<ComparisonData> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<ComparisonData>('get_manual_vs_automated_comparison', {
      automationType,
    });
  } catch (error) {
    console.error('[metrics] failed to get manual vs automated comparison', error);
    throw error;
  }
}

/** Get period-over-period comparison (week, month, quarter, year) */
export async function getPeriodComparison(period: string): Promise<PeriodComparisonData> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<PeriodComparisonData>('get_period_comparison', { period });
  } catch (error) {
    console.error('[metrics] failed to get period comparison', error);
    throw error;
  }
}

/** Get benchmark comparison for a given role */
export async function getBenchmarkComparison(role: string): Promise<BenchmarkComparisonData> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<BenchmarkComparisonData>('get_benchmark_comparison', { role });
  } catch (error) {
    console.error('[metrics] failed to get benchmark comparison', error);
    throw error;
  }
}

/** Get recent activity feed */
export async function getRecentActivity(limit: number): Promise<ActivityItem[]> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<ActivityItem[]>('get_recent_activity', { limit });
  } catch (error) {
    console.error('[metrics] failed to get recent activity', error);
    throw error;
  }
}

/** Export ROI report to file, returns file path */
export async function exportRoiReport(options: ExportOptions): Promise<string> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<string>('export_roi_report', { options });
  } catch (error) {
    console.error('[metrics] failed to export ROI report', error);
    throw error;
  }
}
