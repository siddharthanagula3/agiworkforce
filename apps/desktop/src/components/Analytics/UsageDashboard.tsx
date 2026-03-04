import React, { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
import {
  useBillingUsageStore,
  getUsagePercentage,
  getRemainingPercentage,
} from '../../stores/billingUsage';
import { cn } from '../../lib/utils';
import { useBillingStore } from '../../stores/auth';
import { useAccountStore } from '../../stores/auth';
import {
  queryTimeSeriesData,
  queryCategoryData,
  queryTopEvents,
} from '../../services/analyticsQueries';
import { TimeSeriesData, CategoryData } from '../../types/analytics';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export const UsageDashboard: React.FC = () => {
  // Use individual selectors to prevent re-renders on unrelated state changes
  const systemMetrics = useBillingUsageStore((state) => state.systemMetrics);
  const appMetrics = useBillingUsageStore((state) => state.appMetrics);
  const analyticsUsageStats = useBillingUsageStore((state) => state.analyticsUsageStats);
  const isLoadingMetrics = useBillingUsageStore((state) => state.isLoadingMetrics);
  const loadSystemMetrics = useBillingUsageStore((state) => state.loadSystemMetrics);
  const loadAppMetrics = useBillingUsageStore((state) => state.loadAppMetrics);
  const loadAnalyticsUsageStats = useBillingUsageStore((state) => state.loadAnalyticsUsageStats);
  const refreshAllMetrics = useBillingUsageStore((state) => state.refreshAllMetrics);

  const billingUsageStats = useBillingUsageStore((state) => state.usageStats);
  const getTokenCost = useBillingUsageStore((state) => state.getTokenCost);
  const subscription = useBillingStore((state) => state.subscription);
  // Use useShallow for object selectors to prevent re-renders from reference changes
  const account = useAccountStore(useShallow((state) => state.account));
  const { credits, plan } = account;

  // Calculate monthly credit usage percentage
  const planName = subscription?.plan_name?.toLowerCase() || '';
  let monthlyLimit = 0;
  if (planName.includes('hobby')) monthlyLimit = 1.0;
  else if (planName.includes('pro')) monthlyLimit = 12.0;
  else if (planName.includes('max')) monthlyLimit = 150.0;

  const monthlyCost = getTokenCost();
  const creditPercentage = monthlyLimit > 0 ? Math.min((monthlyCost / monthlyLimit) * 100, 100) : 0;

  const [dauData, setDauData] = useState<TimeSeriesData[]>([]);
  const [featureData, setFeatureData] = useState<CategoryData[]>([]);
  const [topEvents, setTopEvents] = useState<{ event_name: string; count: number }[]>([]);
  const [dateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  });

  const loadChartData = useCallback(async () => {
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
  }, [dateRange]);

  useEffect(() => {
    loadSystemMetrics();
    loadAppMetrics();
    loadAnalyticsUsageStats();
    loadChartData();

    const interval = setInterval(() => {
      refreshAllMetrics();
      loadChartData();
    }, 60000);

    return () => clearInterval(interval);
  }, [
    loadSystemMetrics,
    loadAppMetrics,
    loadAnalyticsUsageStats,
    loadChartData,
    refreshAllMetrics,
  ]);

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
        {}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          <button
            onClick={refreshAllMetrics}
            disabled={isLoadingMetrics}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoadingMetrics ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {subscription?.plan_name && (
            <div className="bg-white dark:bg-charcoal-800 p-4 rounded-lg shadow-xs border border-gray-100 dark:border-charcoal-600">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Plan</h3>
              <p className="text-2xl font-bold mt-2 text-primary capitalize">
                {subscription.plan_name}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Renews:{' '}
                {new Date((subscription.current_period_end || 0) * 1000).toLocaleDateString()}
              </p>
            </div>
          )}

          {(plan === 'hobby' || plan === 'pro' || plan === 'max') && credits && (
            <>
              {/* Daily Credits Card */}
              {credits.daily_limit_cents !== undefined && credits.daily_limit_cents > 0 && (
                <div className="bg-white dark:bg-charcoal-800 p-4 rounded-lg shadow-xs border border-gray-100 dark:border-charcoal-600">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Daily Credits
                  </h3>
                  <p className="text-2xl font-bold mt-2 text-blue-500">
                    {getRemainingPercentage(
                      credits.daily_used_cents || 0,
                      credits.daily_limit_cents,
                    )}
                    % remaining
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {credits.daily_limit_cents
                      ? `${getUsagePercentage(credits.daily_used_cents || 0, credits.daily_limit_cents)}% used`
                      : 'No daily limit'}
                  </p>
                  {credits.daily_limit_cents && credits.daily_limit_cents > 0 && (
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-charcoal-700 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{
                          width: `${Math.min(
                            getUsagePercentage(
                              credits.daily_used_cents || 0,
                              credits.daily_limit_cents,
                            ),
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                  {credits.daily_reset_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Resets in{' '}
                      {Math.ceil(
                        (new Date(credits.daily_reset_at).getTime() - Date.now()) /
                          (1000 * 60 * 60),
                      )}{' '}
                      hours
                    </p>
                  )}
                </div>
              )}

              {/* Monthly Credits Card */}
              {credits.allocated_cents && credits.allocated_cents > 0 && (
                <div className="bg-white dark:bg-charcoal-800 p-4 rounded-lg shadow-xs border border-gray-100 dark:border-charcoal-600">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Monthly Credits
                  </h3>
                  <p className="text-2xl font-bold mt-2 text-amber-500">
                    {getRemainingPercentage(credits.used_cents || 0, credits.allocated_cents)}%
                    remaining
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {credits.allocated_cents
                      ? `${getUsagePercentage(credits.used_cents || 0, credits.allocated_cents)}% used`
                      : 'No credits allocated'}
                  </p>
                  {credits.allocated_cents && (
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-charcoal-700 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{
                          width: `${Math.min(getUsagePercentage(credits.used_cents || 0, credits.allocated_cents), 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="bg-white dark:bg-charcoal-800 p-4 rounded-lg shadow-xs border border-gray-100 dark:border-charcoal-600">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Monthly Usage</h3>
            {monthlyLimit > 0 ? (
              <>
                <p className="text-2xl font-bold mt-2 text-amber-500">
                  {creditPercentage.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-400 mt-1">Monthly credits used</p>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-charcoal-700 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      creditPercentage > 90
                        ? 'bg-red-500'
                        : creditPercentage > 75
                          ? 'bg-amber-500'
                          : 'bg-amber-500',
                    )}
                    style={{ width: `${Math.min(creditPercentage, 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold mt-2 text-amber-500">—</p>
                <p className="text-xs text-gray-400 mt-1">No monthly limit</p>
              </>
            )}
          </div>

          <div className="bg-white dark:bg-charcoal-800 p-4 rounded-lg shadow-xs border border-gray-100 dark:border-charcoal-600">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">LLM Tokens</h3>
            <p className="text-2xl font-bold mt-2 text-blue-500">
              {billingUsageStats?.llm_tokens_used.toLocaleString() ?? '0'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Total tokens processing</p>
          </div>

          <div className="bg-white dark:bg-charcoal-800 p-4 rounded-lg shadow-xs border border-gray-100 dark:border-charcoal-600">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Automations Run
            </h3>
            <p className="text-2xl font-bold mt-2 text-green-500">
              {analyticsUsageStats?.total_events?.toLocaleString() ?? '0'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Lifetime total</p>
          </div>
        </div>

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Daily Active Users"
            value={analyticsUsageStats?.dau || 0}
            trend="+12%"
            trendUp={true}
          />
          <MetricCard
            title="Monthly Active Users"
            value={analyticsUsageStats?.mau || 0}
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

        {}
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

        {}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {}
          <ChartCard title="Daily Active Users (30 Days)">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="value" stroke="#0088FE" fill="#0088FE" name="DAU" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {}
          <ChartCard title="Feature Usage Distribution">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={featureData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: { name?: string; category?: string; percent?: number }) =>
                    `${entry.name || entry.category || 'Unknown'}: ${((entry.percent ?? 0) * 100).toFixed(1)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {featureData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {}
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

          {}
          <ChartCard title="Avg Session Duration (30 Days)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#FF8042" name="Duration (ms)" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {}
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

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, trend, trendUp }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</div>
      <div className="mt-2 flex items-baseline">
        <div className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
        {subtitle && (
          <div className="ml-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</div>
        )}
      </div>
      {trend && (
        <div className={`mt-2 text-sm ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
    </div>
  );
};

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
      {children}
    </div>
  );
};

export default UsageDashboard;
