// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import { ErrorSeverity, errorTracking } from '../services/errorTracking';
import type { UserMetrics } from '../api/analytics';
import type { AllTimeStats, ChartDataPoint } from '../types/roi';

interface ROIState {
  roiReport: AllTimeStats | null;
  processMetrics: ChartDataPoint[];
  userMetrics: UserMetrics[];
  toolMetrics: ChartDataPoint[];
  trends: Record<string, ChartDataPoint[]>;
  isLoadingROI: boolean;
}

interface ROIActions {
  calculateROI: (startDate: number, endDate: number) => Promise<AllTimeStats>;
  loadProcessMetrics: (startDate: number, endDate: number) => Promise<ChartDataPoint[]>;
  loadUserMetrics: (startDate: number, endDate: number) => Promise<UserMetrics[]>;
  loadToolMetrics: (startDate: number, endDate: number) => Promise<ChartDataPoint[]>;
  loadTrends: (metric: string, days: number) => Promise<ChartDataPoint[]>;
  exportReport: (format: string, startDate: number, endDate: number) => Promise<string>;
  loadAllROIData: (startDate: number, endDate: number) => Promise<void>;
}

export type ROIStore = ROIState & ROIActions;

export const useROIStore = create<ROIStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        roiReport: null,
        processMetrics: [],
        userMetrics: [],
        toolMetrics: [],
        trends: {},
        isLoadingROI: false,

        calculateROI: async (startDate: number, endDate: number) => {
          set({ isLoadingROI: true });
          try {
            const roi = await invoke<AllTimeStats>('analytics_calculate_roi', {
              startDate,
              endDate,
            });
            set({ roiReport: roi });
            return roi;
          } catch (error) {
            console.error('Failed to calculate ROI:', error);
            errorTracking.captureError(error instanceof Error ? error : new Error(String(error)), {
              component: 'roiStore',
              severity: ErrorSeverity.HIGH,
            });
            throw error;
          } finally {
            set({ isLoadingROI: false });
          }
        },

        loadProcessMetrics: async (startDate: number, endDate: number) => {
          try {
            const metrics = await invoke<ChartDataPoint[]>('analytics_get_process_metrics', {
              startDate,
              endDate,
            });
            set({ processMetrics: metrics || [] });
            return metrics || [];
          } catch (error) {
            console.error('Failed to load process metrics:', error);
            throw error;
          }
        },

        loadUserMetrics: async (startDate: number, endDate: number) => {
          try {
            const metrics = await invoke<UserMetrics[]>('analytics_get_user_metrics', {
              startDate,
              endDate,
            });
            set({ userMetrics: metrics || [] });
            return metrics || [];
          } catch (error) {
            console.error('Failed to load user metrics:', error);
            throw error;
          }
        },

        loadToolMetrics: async (startDate: number, endDate: number) => {
          try {
            const metrics = await invoke<ChartDataPoint[]>('analytics_get_tool_metrics', {
              startDate,
              endDate,
            });
            set({ toolMetrics: metrics || [] });
            return metrics || [];
          } catch (error) {
            console.error('Failed to load tool metrics:', error);
            throw error;
          }
        },

        loadTrends: async (metric: string, days: number) => {
          try {
            const trendsData = await invoke<ChartDataPoint[]>('analytics_get_metric_trends', {
              metric,
              days,
            });
            const MAX_TREND_METRICS = 20;
            set((state) => {
              const currentKeys = Object.keys(state.trends);
              if (currentKeys.length >= MAX_TREND_METRICS && !state.trends[metric]) {
                const keyToRemove = currentKeys[0];
                if (keyToRemove) {
                  delete state.trends[keyToRemove];
                }
              }
              state.trends[metric] = trendsData || [];
            });
            return trendsData || [];
          } catch (error) {
            console.error('Failed to load trends:', error);
            throw error;
          }
        },

        exportReport: async (format: string, startDate: number, endDate: number) => {
          try {
            const report = await invoke<string>('analytics_export_report', {
              format,
              startDate,
              endDate,
            });

            const blob = new Blob([report as string], {
              type:
                format === 'json'
                  ? 'application/json'
                  : format === 'csv'
                    ? 'text/csv'
                    : 'text/markdown',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `roi-report-${Date.now()}.${format === 'markdown' ? 'md' : format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            return report;
          } catch (error) {
            console.error('Failed to export report:', error);
            throw error;
          }
        },

        loadAllROIData: async (startDate: number, endDate: number) => {
          const { calculateROI, loadProcessMetrics, loadUserMetrics, loadToolMetrics } = get();

          set({ isLoadingROI: true });
          try {
            await Promise.all([
              calculateROI(startDate, endDate),
              loadProcessMetrics(startDate, endDate),
              loadUserMetrics(startDate, endDate),
              loadToolMetrics(startDate, endDate),
            ]);
          } finally {
            set({ isLoadingROI: false });
          }
        },
      })),
    ),
    { name: 'ROIStore', enabled: import.meta.env.DEV },
  ),
);
