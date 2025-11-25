/**
 * ROI Store
 * Zustand store for managing ROI dashboard state and real-time updates
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
    ActivityItem,
    AllTimeStats,
    BenchmarkComparisonData,
    ChartDataPoint,
    ComparisonData,
    ComparisonMode,
    DayStats,
    EmployeeChartData,
    ExportOptions,
    MetricsUpdate,
    Milestone,
    MonthStats,
    PeriodComparisonData,
    WeekStats,
} from '../../types/roi';

interface ROIState {
  // Real-time metrics
  todayStats: DayStats | null;
  weekStats: WeekStats | null;
  monthStats: MonthStats | null;
  allTimeStats: AllTimeStats | null;

  // Live updates
  lastUpdate: number;
  isConnected: boolean;
  updateCount: number;

  // Milestones
  milestones: Milestone[];
  unacknowledgedMilestones: Milestone[];

  // Comparisons
  comparisonMode: ComparisonMode;
  comparisonData: ComparisonData | PeriodComparisonData | BenchmarkComparisonData | null;

  // Recent activity
  recentActivity: ActivityItem[];

  // Chart data
  chartData: ChartDataPoint[];
  employeeChartData: EmployeeChartData[];

  // Loading and error states
  loading: boolean;
  error: string | null;

  // Unsubscribe function
  unsubscribeFn: UnlistenFn | null;

  // Actions
  fetchStats: () => Promise<void>;
  fetchTodayStats: () => Promise<void>;
  fetchWeekStats: () => Promise<void>;
  fetchMonthStats: () => Promise<void>;
  fetchAllTimeStats: () => Promise<void>;
  subscribeToLiveUpdates: () => void;
  unsubscribeFromLiveUpdates: () => void;
  acknowledgeMilestone: (milestoneId: string) => Promise<void>;
  setComparisonMode: (mode: ComparisonMode) => void;
  fetchComparison: (mode: ComparisonMode) => Promise<void>;
  fetchRecentActivity: () => Promise<void>;
  exportReport: (options: ExportOptions) => Promise<string>;
  reset: () => void;
}

const initialState = {
  todayStats: null,
  weekStats: null,
  monthStats: null,
  allTimeStats: null,
  lastUpdate: 0,
  isConnected: false,
  updateCount: 0,
  milestones: [],
  unacknowledgedMilestones: [],
  comparisonMode: 'manual_vs_auto' as ComparisonMode,
  comparisonData: null,
  recentActivity: [],
  chartData: [],
  employeeChartData: [],
  loading: false,
  error: null,
  unsubscribeFn: null,
};

export const useROIStore = create<ROIState>()(
  immer((set, get) => ({
    ...initialState,

    fetchStats: async () => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });

      try {
        await Promise.all([
          get().fetchTodayStats(),
          get().fetchWeekStats(),
          get().fetchMonthStats(),
          get().fetchAllTimeStats(),
          get().fetchRecentActivity(),
        ]);

        set((state) => {
          state.loading = false;
        });
      } catch (error) {
        set((state) => {
          state.loading = false;
          state.error = error instanceof Error ? error.message : 'Failed to fetch stats';
        });
      }
    },

    fetchTodayStats: async () => {
      try {
        const stats = await invoke<DayStats>('get_today_stats');
        set((state) => {
          state.todayStats = stats;
          state.lastUpdate = Date.now();
        });
      } catch (error) {
        console.error('Failed to fetch today stats:', error);
        throw error;
      }
    },

    fetchWeekStats: async () => {
      try {
        const stats = await invoke<WeekStats>('get_week_stats');
        set((state) => {
          state.weekStats = stats;

          // Update chart data with weekly breakdown
          if (stats.dailyBreakdown) {
            state.chartData = stats.dailyBreakdown.map((day) => ({
              date: day.date,
              timeSavedHours: day.timeSavedHours,
              costSavedUsd: day.costSavedUsd,
              automationsRun: day.automationsRun,
            }));
          }

          // Update employee chart data
          if (stats.topEmployees) {
            state.employeeChartData = stats.topEmployees.map((emp) => ({
              employeeName: emp.employeeName,
              timeSavedHours: emp.timeSavedHours,
              costSavedUsd: emp.costSavedUsd,
              automationsRun: emp.automationsRun,
              successRate: emp.successRate,
            }));
          }
        });
      } catch (error) {
        console.error('Failed to fetch week stats:', error);
        throw error;
      }
    },

    fetchMonthStats: async () => {
      try {
        const stats = await invoke<MonthStats>('get_month_stats');
        set((state) => {
          state.monthStats = stats;
        });
      } catch (error) {
        console.error('Failed to fetch month stats:', error);
        throw error;
      }
    },

    fetchAllTimeStats: async () => {
      try {
        const stats = await invoke<AllTimeStats>('get_all_time_stats');
        set((state) => {
          state.allTimeStats = stats;
        });

        // Also fetch milestones
        const milestones = await invoke<Milestone[]>('get_milestones', {
          userId: 'default',
        });
        set((state) => {
          state.milestones = milestones;
          state.unacknowledgedMilestones = milestones.filter((m) => !m.acknowledged);
        });
      } catch (error) {
        console.error('Failed to fetch all-time stats:', error);
        throw error;
      }
    },

    subscribeToLiveUpdates: () => {
      const unsubscribe = listen<MetricsUpdate>('metrics:updated', (event) => {
        set((state) => {
          state.todayStats = event.payload.newStats;
          state.lastUpdate = Date.now();
          state.updateCount = state.updateCount + 1;
          state.isConnected = true;

          // Check for milestones
          if (event.payload.milestoneAchieved && event.payload.milestone) {
            state.unacknowledgedMilestones.push(event.payload.milestone);
            state.milestones.push(event.payload.milestone);
          }
        });

        // Refresh recent activity
        get().fetchRecentActivity();
      });

      set((state) => {
        state.isConnected = true;
        state.unsubscribeFn = unsubscribe as unknown as UnlistenFn;
      });
    },

    unsubscribeFromLiveUpdates: () => {
      const { unsubscribeFn } = get();
      if (unsubscribeFn) {
        unsubscribeFn();
      }

      set((state) => {
        state.isConnected = false;
        state.unsubscribeFn = null;
      });
    },

    acknowledgeMilestone: async (milestoneId: string) => {
      try {
        await invoke('acknowledge_milestone', { milestoneId });

        set((state) => {
          // Mark milestone as acknowledged
          const milestone = state.milestones.find((m) => m.id === milestoneId);
          if (milestone) {
            milestone.acknowledged = true;
          }

          // Remove from unacknowledged list
          state.unacknowledgedMilestones = state.unacknowledgedMilestones.filter(
            (m) => m.id !== milestoneId
          );
        });
      } catch (error) {
        console.error('Failed to acknowledge milestone:', error);
        throw error;
      }
    },

    setComparisonMode: (mode: ComparisonMode) => {
      set((state) => {
        state.comparisonMode = mode;
      });
      get().fetchComparison(mode);
    },

    fetchComparison: async (mode: ComparisonMode) => {
      try {
        let data: ComparisonData | PeriodComparisonData | BenchmarkComparisonData;

        switch (mode) {
          case 'manual_vs_auto':
            data = await invoke<ComparisonData>('get_manual_vs_automated_comparison');
            break;
          case 'period':
            data = await invoke<PeriodComparisonData>('get_period_comparison', {
              period: 'month',
            });
            break;
          case 'benchmark':
            data = await invoke<BenchmarkComparisonData>('get_benchmark_comparison');
            break;
          default:
            throw new Error(`Unknown comparison mode: ${mode}`);
        }

        set((state) => {
          state.comparisonData = data;
        });
      } catch (error) {
        console.error('Failed to fetch comparison:', error);
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to fetch comparison';
        });
      }
    },

    fetchRecentActivity: async () => {
      try {
        const activity = await invoke<ActivityItem[]>('get_recent_activity', {
          limit: 50,
        });

        set((state) => {
          state.recentActivity = activity;
        });
      } catch (error) {
        console.error('Failed to fetch recent activity:', error);
      }
    },

    exportReport: async (options: ExportOptions) => {
      try {
        const filePath = await invoke<string>('export_roi_report', { options });
        return filePath;
      } catch (error) {
        console.error('Failed to export report:', error);
        throw error;
      }
    },

    reset: () => {
      const { unsubscribeFromLiveUpdates } = get();
      unsubscribeFromLiveUpdates();
      set(initialState);
    },
  }))
);
