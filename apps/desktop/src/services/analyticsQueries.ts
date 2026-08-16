import {
  CategoryData,
  ErrorStats,
  FeatureUsageStats,
  FunnelStep,
  RetentionCohort,
  TimeSeriesData,
  UsageStats,
} from '../types/analytics';
import { isTauri } from '../lib/tauri-mock';

const defaultEmptyStats: UsageStats = {
  dau: 0,
  mau: 0,
  total_users: 0,
  new_users_today: 0,
  new_users_this_week: 0,
  new_users_this_month: 0,
  avg_session_duration_ms: 0,
  total_events: 0,
  events_today: 0,
  retention_rate: 0,
};

export async function queryDAU(_dateRange?: { start: Date; end: Date }): Promise<number> {
  const stats = await queryUsageStats();
  return stats.dau;
}

export async function queryMAU(_dateRange?: { start: Date; end: Date }): Promise<number> {
  const stats = await queryUsageStats();
  return stats.mau;
}

export async function queryUsageStats(): Promise<UsageStats> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<UsageStats>('analytics_get_usage_stats');
    } catch (error) {
      console.error('[Analytics] Failed to get usage stats:', error);
      return defaultEmptyStats;
    }
  }

  return defaultEmptyStats;
}

export async function queryFeatureUsage(_dateRange?: {
  start: Date;
  end: Date;
}): Promise<FeatureUsageStats[]> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<FeatureUsageStats[]>('analytics_get_feature_usage');
    } catch (error) {
      console.error('[Analytics] Failed to get feature usage:', error);
      return [];
    }
  }

  return [];
}

export async function queryAvgSessionDuration(_dateRange?: {
  start: Date;
  end: Date;
}): Promise<number> {
  const stats = await queryUsageStats();
  return stats.avg_session_duration_ms;
}

export async function queryRetentionRate(cohortDate: Date): Promise<RetentionCohort> {
  return {
    cohort_date: cohortDate.toISOString(),
    users_count: 0,
    day_1_retention: 0,
    day_7_retention: 0,
    day_30_retention: 0,
  };
}

export async function queryConversionFunnel(_funnelName: string): Promise<FunnelStep[]> {
  return [];
}

export async function queryErrorStats(_dateRange?: {
  start: Date;
  end: Date;
}): Promise<ErrorStats[]> {
  return [];
}

export async function queryTimeSeriesData(
  metric: 'dau' | 'events' | 'session_duration',
  dateRange: { start: Date; end: Date },
): Promise<TimeSeriesData[]> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const days = Math.ceil(
        (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
      );

      const backendMetric = metric === 'events' ? 'automations' : 'success_rate';

      const trends = await invoke<{ date: string; value: number }[]>(
        'analytics_get_metric_trends',
        {
          metric: backendMetric,
          days,
        },
      );

      return trends.map((point) => ({
        timestamp: new Date(point.date).getTime(),
        value: point.value,
        label: point.date,
      }));
    } catch (error) {
      console.error('[Analytics] Failed to query time series data:', error);
      return [];
    }
  }

  return [];
}

export async function queryCategoryData(
  category: 'features' | 'errors' | 'pages',
): Promise<CategoryData[]> {
  if (category === 'features') {
    const usage = await queryFeatureUsage();
    const total = usage.reduce((sum, f) => sum + f.usage_count, 0);
    if (total === 0) return [];
    return usage
      .map((f) => ({
        category: f.feature_name,
        value: f.usage_count,
        percentage: Math.round((f.usage_count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.value - a.value);
  }

  return [];
}

export async function queryTopEvents(
  limit: number = 10,
  _dateRange?: { start: Date; end: Date },
): Promise<{ event_name: string; count: number }[]> {
  const usage = await queryFeatureUsage();
  return usage
    .map((f) => ({
      event_name: f.feature_name,
      count: f.usage_count,
    }))
    .slice(0, limit);
}

export async function queryPerformanceMetrics(_dateRange: { start: Date; end: Date }): Promise<{
  avg_page_load_time: TimeSeriesData[];
  avg_api_response_time: TimeSeriesData[];
  memory_usage: TimeSeriesData[];
}> {
  return {
    avg_page_load_time: [],
    avg_api_response_time: [],
    memory_usage: [],
  };
}

export async function exportAnalyticsReport(
  format: 'json' | 'csv',
  dateRange: { start: Date; end: Date },
): Promise<Blob> {
  const data = {
    usage_stats: await queryUsageStats(),
    feature_usage: await queryFeatureUsage(dateRange),
    error_stats: await queryErrorStats(dateRange),
    top_events: await queryTopEvents(20, dateRange),
  };

  if (format === 'json') {
    return new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
  } else {
    const csv = 'Report data in CSV format';
    return new Blob([csv], { type: 'text/csv' });
  }
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface ProcessMetrics {
  processName: string;
  totalDuration: number;
  executionCount: number;
  avgDuration: number;
}

export interface AnalyticsSnapshot {
  id: string;
  userId: string;
  teamId?: string;
  startDate: number;
  endDate: number;
  createdAt: string;
}

export async function generateWeeklyReport(): Promise<string> {
  if (!isTauri) return 'Weekly report unavailable in browser mode.';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('analytics_generate_weekly_report');
  } catch (error) {
    console.error('[Analytics] Failed to generate weekly report:', error);
    return '';
  }
}

export async function generateMonthlyReport(): Promise<string> {
  if (!isTauri) return 'Monthly report unavailable in browser mode.';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('analytics_generate_monthly_report');
  } catch (error) {
    console.error('[Analytics] Failed to generate monthly report:', error);
    return '';
  }
}

export async function getCostSavedTrend(days: number = 30): Promise<TrendPoint[]> {
  if (!isTauri) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<TrendPoint[]>('analytics_get_cost_saved_trend', { days });
  } catch (error) {
    console.error('[Analytics] Failed to get cost saved trend:', error);
    return [];
  }
}

export async function getTimeSavedTrend(days: number = 30): Promise<TrendPoint[]> {
  if (!isTauri) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<TrendPoint[]>('analytics_get_time_saved_trend', { days });
  } catch (error) {
    console.error('[Analytics] Failed to get time saved trend:', error);
    return [];
  }
}

export async function getTopProcesses(
  startDate: number,
  endDate: number,
  limit: number = 10,
): Promise<ProcessMetrics[]> {
  if (!isTauri) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<ProcessMetrics[]>('analytics_get_top_processes', {
      startDate,
      endDate,
      limit,
    });
  } catch (error) {
    console.error('[Analytics] Failed to get top processes:', error);
    return [];
  }
}

export async function saveAnalyticsSnapshot(
  startDate: number,
  endDate: number,
  teamId?: string,
): Promise<AnalyticsSnapshot | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<AnalyticsSnapshot>('analytics_save_snapshot', {
      teamId,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error('[Analytics] Failed to save analytics snapshot:', error);
    return null;
  }
}
