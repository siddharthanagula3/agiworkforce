
import { invoke, isTauri } from '../lib/tauri-mock';

export interface RecordAutomationRequest {
  automationName: string;
  estimatedManualTimeMs: number;
  actualExecutionTimeMs: number;
  tasksCompleted?: number;
  errorsPrevented?: number;
  qualityScore?: number;
}

export interface MetricsSnapshot {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  totalAutomationsRun: number;
  avgTimeSavedPerRun: number;
}

export interface RealtimeStats {
  today: MetricsSnapshot;
  thisWeek: MetricsSnapshot;
  thisMonth: MetricsSnapshot;
  allTime: MetricsSnapshot;
}

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

export interface PeriodComparison {
  current: MetricsSnapshot;
  previous: MetricsSnapshot;
  timeSavedChangePercent: number;
}

export interface BenchmarkComparison {
  userTimeSaved: number;
  industryAvgTimeSaved: number;
  userCostSaved: number;
  industryAvgCostSaved: number;
  aboveAverage: boolean;
  percentile: number;
}

export interface MilestoneData {
  id: string;
  milestoneType: string;
  thresholdValue: number;
  achievedAt: number;
  shared: boolean;
}

export interface DayStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromYesterday: number;
  topAutomation: string;
  topAutomationTimeSaved: number;
}

export interface TopAutomationData {
  automationName: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
  successRate: number;
}

export interface DailyBreakdown {
  date: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

export interface WeekStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastWeek: number;
  topAutomations: TopAutomationData[];
  dailyBreakdown: DailyBreakdown[];
}

export interface WeeklyBreakdown {
  weekStart: string;
  weekEnd: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

export interface MonthStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  changeFromLastMonth: number;
  topAutomations: TopAutomationData[];
  weeklyBreakdown: WeeklyBreakdown[];
}

export interface MonthlyTrend {
  month: string;
  timeSavedHours: number;
  costSavedUsd: number;
  automationsRun: number;
}

export interface AllTimeStats {
  totalTimeSavedHours: number;
  totalCostSavedUsd: number;
  automationsRun: number;
  avgQualityScore: number;
  milestonesAchieved: number;
  topAutomations: TopAutomationData[];
  monthlyTrend: MonthlyTrend[];
}

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

export interface BenchmarkComparisonData {
  yourTimeSavedHours: number;
  industryAverageTimeSavedHours: number;
  yourCostSavedUsd: number;
  industryAverageCostSavedUsd: number;
  yourAutomationsRun: number;
  industryAverageAutomationsRun: number;
  percentageBetter: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: number;
  timeSavedMinutes?: number;
  costSavedUsd?: number;
  automationName?: string;
  status?: string;
}

export interface ExportOptions {
  dateRange: string;
  format: string;
  includeCharts: boolean;
  includeDetailedLog: boolean;
  includeComparison: boolean;
  includeAutomationBreakdown: boolean;
  startDate?: string;
  endDate?: string;
}

export async function getRealtimeStats(): Promise<RealtimeStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<RealtimeStats>('get_realtime_stats');
  } catch (error) {
    console.error('[metrics] failed to get realtime stats', error);
    throw error;
  }
}

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

export async function getMetricsHistory(days: number): Promise<MetricsSnapshot[]> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MetricsSnapshot[]>('get_metrics_history', { days });
  } catch (error) {
    console.error('[metrics] failed to get metrics history', error);
    throw error;
  }
}

export async function compareToManual(automationType: string): Promise<Comparison> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<Comparison>('compare_to_manual', { automationType });
  } catch (error) {
    console.error('[metrics] failed to compare to manual', error);
    throw error;
  }
}

export async function compareToPreviousPeriod(days: number): Promise<PeriodComparison> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<PeriodComparison>('compare_to_previous_period', { days });
  } catch (error) {
    console.error('[metrics] failed to compare to previous period', error);
    throw error;
  }
}

export async function compareToIndustryBenchmark(role: string): Promise<BenchmarkComparison> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<BenchmarkComparison>('compare_to_industry_benchmark', { role });
  } catch (error) {
    console.error('[metrics] failed to compare to industry benchmark', error);
    throw error;
  }
}

export async function getMilestones(): Promise<MilestoneData[]> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MilestoneData[]>('get_milestones');
  } catch (error) {
    console.error('[metrics] failed to get milestones', error);
    throw error;
  }
}

export async function shareMilestone(milestoneId: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    await invoke<void>('share_milestone', { milestoneId });
  } catch (error) {
    console.error('[metrics] failed to share milestone', error);
    throw error;
  }
}

export async function getTodayStats(): Promise<DayStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<DayStats>('get_today_stats');
  } catch (error) {
    console.error('[metrics] failed to get today stats', error);
    throw error;
  }
}

export async function getWeekStats(): Promise<WeekStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<WeekStats>('get_week_stats');
  } catch (error) {
    console.error('[metrics] failed to get week stats', error);
    throw error;
  }
}

export async function getMonthStats(): Promise<MonthStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<MonthStats>('get_month_stats');
  } catch (error) {
    console.error('[metrics] failed to get month stats', error);
    throw error;
  }
}

export async function getAllTimeStats(): Promise<AllTimeStats> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<AllTimeStats>('get_all_time_stats');
  } catch (error) {
    console.error('[metrics] failed to get all time stats', error);
    throw error;
  }
}

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

export async function getPeriodComparison(period: string): Promise<PeriodComparisonData> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<PeriodComparisonData>('get_period_comparison', { period });
  } catch (error) {
    console.error('[metrics] failed to get period comparison', error);
    throw error;
  }
}

export async function getBenchmarkComparison(role: string): Promise<BenchmarkComparisonData> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<BenchmarkComparisonData>('get_benchmark_comparison', { role });
  } catch (error) {
    console.error('[metrics] failed to get benchmark comparison', error);
    throw error;
  }
}

export async function getRecentActivity(limit: number): Promise<ActivityItem[]> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<ActivityItem[]>('get_recent_activity', { limit });
  } catch (error) {
    console.error('[metrics] failed to get recent activity', error);
    throw error;
  }
}

export async function exportRoiReport(options: ExportOptions): Promise<string> {
  try {
    if (!isTauri) throw new Error('Metrics requires Tauri runtime');
    return await invoke<string>('export_roi_report', { options });
  } catch (error) {
    console.error('[metrics] failed to export ROI report', error);
    throw error;
  }
}
