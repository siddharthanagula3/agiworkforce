// Updated Nov 16, 2025: Added React.memo and performance optimizations
import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '../ui/Card';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface PeriodStats {
  total_time_saved_hours: number;
  total_cost_saved_usd: number;
  total_automations_run: number;
  avg_time_saved_per_run: number;
  success_rate: number;
  top_employees: EmployeePerformance[];
}

interface EmployeePerformance {
  employee_id: string;
  employee_name: string;
  total_time_saved_hours: number;
  total_cost_saved_usd: number;
  automations_run: number;
  success_rate: number;
}

interface RealtimeStats {
  today: PeriodStats;
  this_week: PeriodStats;
  this_month: PeriodStats;
  all_time: PeriodStats;
}

type TimeRange = 'today' | 'week' | 'month' | 'all';

// Updated Nov 16, 2025: Memoized array to prevent re-creation on each render
const TIME_RANGE_OPTIONS: TimeRange[] = ['today', 'week', 'month', 'all'];

const RealtimeROIDashboardComponent: React.FC = () => {
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>('today');
  const userId = useAuthStore((state) => state.getCurrentUserId());

  // Updated Nov 16, 2025: Fixed missing dependency and potential memory leak
  const loadStats = React.useCallback(async () => {
    try {
      const result = await invoke<RealtimeStats>('get_realtime_stats', {
        userId,
      });
      setStats(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStats();

    // Refresh stats every 10 seconds
    const interval = setInterval(loadStats, 10000);

    return () => clearInterval(interval);
  }, [loadStats]);

  // Updated Nov 16, 2025: Memoized to prevent re-computation on unrelated state changes
  const getCurrentStats = useCallback((): PeriodStats => {
    if (!stats) return defaultStats;

    switch (range) {
      case 'today':
        return stats.today;
      case 'week':
        return stats.this_week;
      case 'month':
        return stats.this_month;
      case 'all':
        return stats.all_time;
      default:
        return stats.today;
    }
  }, [stats, range]);

  const formatTime = useCallback((hours: number): string => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours.toFixed(1)}h`;
  }, []);

  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  // Updated Nov 16, 2025: Move useMemo before early returns to fix React Hooks rules
  const currentStats = useMemo(() => getCurrentStats(), [getCurrentStats]);
  const topEmployees = useMemo(
    () => currentStats.top_employees.slice(0, 5),
    [currentStats.top_employees],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">
          <p className="text-lg font-semibold">Error loading metrics</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={loadStats}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Your ROI Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Live</span>
        </div>
      </div>

      {/* Time Range Selector */}
      {/* Updated Nov 16, 2025: Use memoized array to prevent re-creation */}
      <div className="flex gap-2">
        {TIME_RANGE_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              range === r
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {r === 'today'
              ? 'Today'
              : r === 'week'
                ? 'This Week'
                : r === 'month'
                  ? 'This Month'
                  : 'All Time'}
          </button>
        ))}
      </div>

      {/* Big Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BigStatCard
          title="Time Saved"
          value={formatTime(currentStats.total_time_saved_hours)}
          subtitle={`${currentStats.total_automations_run} automations`}
          color="blue"
          icon="⏰"
        />
        <BigStatCard
          title="Cost Saved"
          value={formatCurrency(currentStats.total_cost_saved_usd)}
          subtitle={`${formatCurrency(currentStats.avg_time_saved_per_run * 50)} avg per run`}
          color="green"
          icon="💰"
        />
        <BigStatCard
          title="Success Rate"
          value={`${(currentStats.success_rate * 100).toFixed(0)}%`}
          subtitle={`${currentStats.total_automations_run} completed`}
          color="purple"
          icon="✓"
        />
      </div>

      {/* Top Employees */}
      {/* Updated Nov 16, 2025: Memoize sliced array to prevent re-creation */}
      {currentStats.top_employees.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Top Performers
          </h2>
          <div className="space-y-3">
            {topEmployees.map((employee, index) => (
              <div
                key={employee.employee_id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {employee.employee_name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {employee.automations_run} automations
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">
                    {formatCurrency(employee.total_cost_saved_usd)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatTime(employee.total_time_saved_hours)} saved
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

RealtimeROIDashboardComponent.displayName = 'RealtimeROIDashboard';

export const RealtimeROIDashboard = memo(RealtimeROIDashboardComponent);

interface BigStatCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: 'blue' | 'green' | 'purple';
  icon: string;
}

// Updated Nov 16, 2025: Memoized color classes outside component
const COLOR_CLASSES = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
} as const;

// Updated Nov 16, 2025: Memoized BigStatCard to prevent unnecessary re-renders
const BigStatCardComponent: React.FC<BigStatCardProps> = ({
  title,
  value,
  subtitle,
  color,
  icon,
}) => {
  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{value}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        </div>
        <div
          className={`w-12 h-12 ${COLOR_CLASSES[color]} rounded-lg flex items-center justify-center text-2xl`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
};

BigStatCardComponent.displayName = 'BigStatCard';

const BigStatCard = memo(BigStatCardComponent);

const defaultStats: PeriodStats = {
  total_time_saved_hours: 0,
  total_cost_saved_usd: 0,
  total_automations_run: 0,
  avg_time_saved_per_run: 0,
  success_rate: 0,
  top_employees: [],
};
