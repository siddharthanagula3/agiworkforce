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
    users_count: 100,
    day_1_retention: 85,
    day_7_retention: 60,
    day_30_retention: 40,
  };
}

export async function queryConversionFunnel(funnelName: string): Promise<FunnelStep[]> {
  if (funnelName === 'onboarding') {
    return [
      {
        step_name: 'App Opened',
        step_order: 1,
        users_count: 1000,
        conversion_rate: 100,
      },
      {
        step_name: 'Signed Up',
        step_order: 2,
        users_count: 800,
        conversion_rate: 80,
        avg_time_to_next_step_ms: 60000,
      },
      {
        step_name: 'First Automation',
        step_order: 3,
        users_count: 600,
        conversion_rate: 75,
        avg_time_to_next_step_ms: 300000,
      },
      {
        step_name: 'First Goal',
        step_order: 4,
        users_count: 400,
        conversion_rate: 66.67,
        avg_time_to_next_step_ms: 600000,
      },
    ];
  }

  return [];
}

export async function queryErrorStats(_dateRange?: {
  start: Date;
  end: Date;
}): Promise<ErrorStats[]> {
  return [
    {
      error_type: 'NetworkError',
      count: 45,
      unique_users: 12,
      first_seen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen: new Date().toISOString(),
      severity: 'medium',
      resolved: false,
    },
    {
      error_type: 'ValidationError',
      count: 23,
      unique_users: 8,
      first_seen: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen: new Date().toISOString(),
      severity: 'low',
      resolved: true,
    },
  ];
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
    return [
      { category: 'Parallel Execution', value: 350, percentage: 35 },
      { category: 'Browser Automation', value: 280, percentage: 28 },
      { category: 'Code Completion', value: 180, percentage: 18 },
      { category: 'Vision Automation', value: 120, percentage: 12 },
      { category: 'Other', value: 70, percentage: 7 },
    ];
  }

  if (category === 'errors') {
    return [
      { category: 'Network Errors', value: 45, percentage: 45 },
      { category: 'Validation Errors', value: 30, percentage: 30 },
      { category: 'Runtime Errors', value: 15, percentage: 15 },
      { category: 'Other', value: 10, percentage: 10 },
    ];
  }

  if (category === 'pages') {
    return [
      { category: 'Chat', value: 400, percentage: 40 },
      { category: 'Automation', value: 250, percentage: 25 },
      { category: 'Settings', value: 150, percentage: 15 },
      { category: 'Browser', value: 120, percentage: 12 },
      { category: 'Other', value: 80, percentage: 8 },
    ];
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

export async function queryPerformanceMetrics(dateRange: { start: Date; end: Date }): Promise<{
  avg_page_load_time: TimeSeriesData[];
  avg_api_response_time: TimeSeriesData[];
  memory_usage: TimeSeriesData[];
}> {
  const days = Math.ceil(
    (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
  );

  const generateData = (baseValue: number) => {
    const data: TimeSeriesData[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(dateRange.start);
      date.setDate(date.getDate() + i);
      data.push({
        timestamp: date.getTime(),
        value: baseValue + Math.random() * 100,
        label: date.toLocaleDateString(),
      });
    }
    return data;
  };

  return {
    avg_page_load_time: generateData(200),
    avg_api_response_time: generateData(150),
    memory_usage: generateData(500),
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

// ============================================================================
// Newly-wired Tauri analytics commands
// ============================================================================

/** A single data point in a trend series */
export interface TrendPoint {
  date: string;
  value: number;
}

/** Process-level usage metrics */
export interface ProcessMetrics {
  processName: string;
  totalDuration: number;
  executionCount: number;
  avgDuration: number;
}

/** Analytics snapshot metadata */
export interface AnalyticsSnapshot {
  id: string;
  userId: string;
  teamId?: string;
  startDate: number;
  endDate: number;
  createdAt: string;
}

/**
 * Generate a weekly analytics report.
 * Returns a formatted report string.
 */
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

/**
 * Generate a monthly analytics report.
 * Returns a formatted report string.
 */
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

/**
 * Get cost-saved trend data over a number of days.
 */
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

/**
 * Get time-saved trend data over a number of days.
 */
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

/**
 * Get top automated processes by usage.
 */
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

/**
 * Save an analytics snapshot for later comparison.
 */
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
