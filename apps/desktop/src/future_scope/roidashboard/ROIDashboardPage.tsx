/**
 * ROIDashboardPage Component
 * Main page for the Real-Time ROI Dashboard
 */

import { Clock, DollarSign, Download, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { BigStatCard } from './components/BigStatCard';
import { ComparisonSection } from './components/ComparisonSection';
import { CostSavedChart } from './components/CostSavedChart';
import { ExportReportModal } from './components/ExportReportModal';
import { LiveIndicator } from './components/LiveIndicator';
import { MilestoneToast } from './components/MilestoneToast';
import { RecentActivityFeed } from './components/RecentActivityFeed';
import { TimeSavedChart } from './components/TimeSavedChart';
import { useROIStore } from './roiStore';

export function ROIDashboardPage() {
  const {
    todayStats,
    chartData,
    employeeChartData,
    recentActivity,
    lastUpdate,
    isConnected,
    updateCount,
    loading,
    error,
    fetchStats,
    subscribeToLiveUpdates,
    unsubscribeFromLiveUpdates,
  } = useROIStore();

  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Initialize data and subscribe to live updates
  useEffect(() => {
    // Fetch initial data
    fetchStats();

    // Subscribe to live updates
    subscribeToLiveUpdates();

    // Cleanup on unmount
    return () => {
      unsubscribeFromLiveUpdates();
    };
  }, [fetchStats, subscribeToLiveUpdates, unsubscribeFromLiveUpdates]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error('Failed to load ROI data', {
        description: error,
      });
    }
  }, [error]);

  const formatTime = (hours?: number): string => {
    if (!hours) return '0h';
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours.toFixed(1)}h`;
  };

  const formatCurrency = (amount?: number): string => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleRefresh = async () => {
    try {
      await fetchStats();
      toast.success('Dashboard refreshed');
    } catch (err) {
      toast.error('Failed to refresh dashboard');
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">ROI Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Track your automation value in real-time
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setExportModalOpen(true)}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Live Indicator */}
          <LiveIndicator
            connected={isConnected}
            lastUpdate={lastUpdate}
            updateCount={updateCount}
          />

          {/* Big Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <BigStatCard
              title="Time Saved Today"
              value={formatTime(todayStats?.totalTimeSavedHours)}
              change={todayStats?.changeFromYesterday}
              icon={Clock}
              iconColor="text-blue-600 dark:text-blue-400"
              loading={loading}
            />
            <BigStatCard
              title="Cost Saved Today"
              value={formatCurrency(todayStats?.totalCostSavedUsd)}
              change={todayStats?.changeFromYesterday}
              icon={DollarSign}
              iconColor="text-green-600 dark:text-green-400"
              loading={loading}
            />
            <BigStatCard
              title="Automations Run"
              value={todayStats?.automationsRun || 0}
              change={todayStats?.changeFromYesterday}
              icon={Zap}
              iconColor="text-purple-600 dark:text-purple-400"
              loading={loading}
            />
            <BigStatCard
              title="Quality Score"
              value={
                todayStats?.avgQualityScore
                  ? `${(todayStats.avgQualityScore * 100).toFixed(0)}%`
                  : '0%'
              }
              icon={TrendingUp}
              iconColor="text-orange-600 dark:text-orange-400"
              loading={loading}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TimeSavedChart data={chartData} loading={loading} />
            <CostSavedChart data={employeeChartData} loading={loading} />
          </div>

          {/* Comparison Section */}
          <ComparisonSection />

          {/* Recent Activity */}
          <RecentActivityFeed activities={recentActivity} loading={loading} />
        </div>
      </div>

      {/* Milestone Toast */}
      <MilestoneToast />

      {/* Export Modal */}
      <ExportReportModal open={exportModalOpen} onClose={() => setExportModalOpen(false)} />
    </div>
  );
}
