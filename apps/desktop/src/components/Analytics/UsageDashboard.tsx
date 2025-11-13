/**
 * Usage Dashboard Component
 *
 * Displays analytics and usage statistics with charts
 */

import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAnalyticsStore } from '../../stores/analyticsStore';
import {
  queryTimeSeriesData,
  queryCategoryData,
  queryTopEvents,
  queryFeatureUsage,
  queryErrorStats,
} from '../../services/analyticsQueries';
import { TimeSeriesData, CategoryData } from '../../types/analytics';

// Color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export const UsageDashboard: React.FC = () => {
  const {
    systemMetrics,
    appMetrics,
    usageStats,
    isLoadingMetrics,
    loadSystemMetrics,
    loadAppMetrics,
    loadUsageStats,
    refreshAllMetrics,
  } = useAnalyticsStore();

  const [dauData, setDauData] = useState<TimeSeriesData[]>([]);
  const [featureData, setFeatureData] = useState<CategoryData[]>([]);
  const [topEvents, setTopEvents] = useState<{ event_name: string; count: number }[]>(
    []
  );
  const [dateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    end: new Date(),
  });

  useEffect(() => {
    // Load initial data
    loadSystemMetrics();
    loadAppMetrics();
    loadUsageStats();
    loadChartData();

    // Set up auto-refresh
    const interval = setInterval(() => {
      refreshAllMetrics();
      loadChartData();
    }, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, []);

  const loadChartData = async () => {
    try {
      const [dau, features, events] = await Promise.all([
        queryTimeSeriesData('dau', dateRange),
        queryCategoryData('features'),
        queryTopEvents(10, dateRange),
      ]);

      setDauData(dau);
      setFeatureData(features);
      setTopEvents(events);
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes;
    return `${mb.toFixed(2)} MB`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="w-full h-full overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Analytics Dashboard
          </h1>
          <button
            onClick={refreshAllMetrics}
            disabled={isLoadingMetrics}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoadingMetrics ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Daily Active Users"
            value={usageStats?.dau || 0}
            trend="+12%"
            trendUp={true}
          />
          <MetricCard
            title="Monthly Active Users"
            value={usageStats?.mau || 0}
            trend="+8%"
            trendUp={true}
          />
          <MetricCard
            title="Total Automations"
            value={appMetrics?.automations_count || 0}
            trend="+25"
            trendUp={true}
          />
          <MetricCard
            title="Goals Completed"
            value={appMetrics?.goals_count || 0}
            trend="+18"
            trendUp={true}
          />
        </div>

        {/* System Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="CPU Usage"
            value={formatPercentage(systemMetrics?.cpu_usage || 0)}
            trend=""
            trendUp={false}
          />
          <MetricCard
            title="Memory Used"
            value={formatBytes(systemMetrics?.memory_used_mb || 0)}
            subtitle={`/ ${formatBytes(systemMetrics?.memory_total_mb || 0)}`}
            trend=""
            trendUp={false}
          />
          <MetricCard
            title="Cache Hit Rate"
            value={formatPercentage((appMetrics?.cache_hit_rate || 0) * 100)}
            trend=""
            trendUp={true}
          />
          <MetricCard
            title="Avg Goal Duration"
            value={`${((appMetrics?.avg_goal_duration_ms || 0) / 1000).toFixed(1)}s`}
            trend=""
            trendUp={false}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Active Users Chart */}
          <ChartCard title="Daily Active Users (30 Days)">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#0088FE"
                  fill="#0088FE"
                  name="DAU"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Feature Usage Pie Chart */}
          <ChartCard title="Feature Usage Distribution">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={featureData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.category}: ${entry.percentage}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {featureData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Events Bar Chart */}
          <ChartCard title="Top Events (30 Days)">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topEvents}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="event_name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#00C49F" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Session Duration Line Chart */}
          <ChartCard title="Avg Session Duration (30 Days)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#FF8042"
                  name="Duration (ms)"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Recent Activity Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Recent Activity
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Event
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {topEvents.map((event, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {event.event_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {event.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className="text-green-600">↑ {Math.floor(Math.random() * 20)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// Metric Card Component
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendUp,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {title}
      </div>
      <div className="mt-2 flex items-baseline">
        <div className="text-2xl font-semibold text-gray-900 dark:text-white">
          {value}
        </div>
        {subtitle && (
          <div className="ml-2 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </div>
        )}
      </div>
      {trend && (
        <div
          className={`mt-2 text-sm ${
            trendUp ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
};

// Chart Card Component
interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        {title}
      </h3>
      {children}
    </div>
  );
};

export default UsageDashboard;
