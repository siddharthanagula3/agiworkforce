/**
 * Analytics Queries Service
 *
 * Query analytics data for dashboards and reports
 */

import {
  CategoryData,
  ErrorStats,
  FeatureUsageStats,
  FunnelStep,
  RetentionCohort,
  TimeSeriesData,
  UsageStats,
} from '../types/analytics';

// Detect if we're running in Tauri context
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Default empty stats for web fallback
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

/**
 * Query daily active users (DAU)
 */
export async function queryDAU(_dateRange?: { start: Date; end: Date }): Promise<number> {
  // DAU is part of the usage stats response
  const stats = await queryUsageStats();
  return stats.dau;
}

/**
 * Query monthly active users (MAU)
 */
export async function queryMAU(_dateRange?: { start: Date; end: Date }): Promise<number> {
  // MAU is part of the usage stats response
  const stats = await queryUsageStats();
  return stats.mau;
}

/**
 * Query usage stats from backend
 */
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
  // Web fallback - return empty stats
  return defaultEmptyStats;
}

/**
 * Query feature usage from backend
 */
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
  // Web fallback - return empty array
  return [];
}

/**
 * Query average session duration
 */
export async function queryAvgSessionDuration(_dateRange?: {
  start: Date;
  end: Date;
}): Promise<number> {
  // In production, this would query the backend
  // Return duration in milliseconds
  return 1800000; // 30 minutes
}

/**
 * Query retention rate
 */
export async function queryRetentionRate(cohortDate: Date): Promise<RetentionCohort> {
  // In production, this would query the backend
  return {
    cohort_date: cohortDate.toISOString(),
    users_count: 100,
    day_1_retention: 85,
    day_7_retention: 60,
    day_30_retention: 40,
  };
}

/**
 * Query conversion funnel
 */
export async function queryConversionFunnel(funnelName: string): Promise<FunnelStep[]> {
  // In production, this would query the backend
  // Example: Onboarding funnel
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

/**
 * Query error rate by version
 */
export async function queryErrorStats(_dateRange?: {
  start: Date;
  end: Date;
}): Promise<ErrorStats[]> {
  // In production, this would query the backend
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

/**
 * Query time series data for charts
 */
export async function queryTimeSeriesData(
  _metric: 'dau' | 'events' | 'session_duration',
  dateRange: { start: Date; end: Date },
): Promise<TimeSeriesData[]> {
  // In production, this would query the backend
  const data: TimeSeriesData[] = [];
  const days = Math.ceil(
    (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
  );

  for (let i = 0; i < days; i++) {
    const date = new Date(dateRange.start);
    date.setDate(date.getDate() + i);

    data.push({
      timestamp: date.getTime(),
      value: Math.floor(Math.random() * 1000),
      label: date.toLocaleDateString(),
    });
  }

  return data;
}

/**
 * Query category data for charts (e.g., feature usage breakdown)
 */
export async function queryCategoryData(
  category: 'features' | 'errors' | 'pages',
): Promise<CategoryData[]> {
  // In production, this would query the backend
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

/**
 * Query top events
 */
export async function queryTopEvents(
  limit: number = 10,
  _dateRange?: { start: Date; end: Date },
): Promise<{ event_name: string; count: number }[]> {
  // In production, this would query the backend
  return [
    { event_name: 'chat_message_sent', count: 1523 },
    { event_name: 'automation_executed', count: 892 },
    { event_name: 'goal_submitted', count: 456 },
    { event_name: 'browser_automation_started', count: 378 },
    { event_name: 'file_uploaded', count: 234 },
    { event_name: 'settings_changed', count: 189 },
    { event_name: 'mcp_tool_called', count: 156 },
    { event_name: 'feature_discovered', count: 123 },
    { event_name: 'error_occurred', count: 89 },
    { event_name: 'data_exported', count: 45 },
  ].slice(0, limit);
}

/**
 * Query performance metrics over time
 */
export async function queryPerformanceMetrics(dateRange: { start: Date; end: Date }): Promise<{
  avg_page_load_time: TimeSeriesData[];
  avg_api_response_time: TimeSeriesData[];
  memory_usage: TimeSeriesData[];
}> {
  // In production, this would query the backend
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

/**
 * Export analytics report
 */
export async function exportAnalyticsReport(
  format: 'json' | 'csv',
  dateRange: { start: Date; end: Date },
): Promise<Blob> {
  // In production, this would generate a full report
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
    // Convert to CSV
    const csv = 'Report data in CSV format'; // Simplified
    return new Blob([csv], { type: 'text/csv' });
  }
}
