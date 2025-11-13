/**
 * Performance Monitoring Service
 *
 * Track app performance, page load times, API response times, and Web Vitals
 */

import { invoke } from '@tauri-apps/api/core';
import { analytics } from './analytics';
import {
  PerformanceMetrics,
  PerformanceMark,
  PerformanceMeasure,
  SystemMetrics,
  AppMetrics,
} from '../types/analytics';

class PerformanceMonitoringService {
  private marks: Map<string, PerformanceMark> = new Map();
  private measures: PerformanceMeasure[] = [];
  private appStartTime: number;

  constructor() {
    this.appStartTime = Date.now();
    this.initializeWebVitals();
    this.trackAppStartup();
  }

  /**
   * Initialize Web Vitals monitoring
   */
  private initializeWebVitals() {
    try {
      // Track LCP (Largest Contentful Paint)
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          analytics.track('app_opened', {
            lcp: lastEntry.startTime,
            metric: 'largest_contentful_paint',
          });
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // Track FID (First Input Delay)
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          const fid = entry.processingStart - entry.startTime;
          analytics.track('app_opened', {
            fid,
            metric: 'first_input_delay',
          });
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Track CLS (Cumulative Layout Shift)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // Report CLS on page unload
      window.addEventListener('beforeunload', () => {
        if (clsValue > 0) {
          analytics.track('app_opened', {
            cls: clsValue,
            metric: 'cumulative_layout_shift',
          });
        }
      });

      // Track Navigation Timing
      window.addEventListener('load', () => {
        const perfData = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;

        if (perfData) {
          const pageLoadTime = perfData.loadEventEnd - perfData.fetchStart;
          const ttfb = perfData.responseStart - perfData.requestStart;
          const domContentLoaded = perfData.domContentLoadedEventEnd - perfData.fetchStart;

          analytics.track('app_opened', {
            page_load_time_ms: pageLoadTime,
            ttfb,
            dom_content_loaded_ms: domContentLoaded,
            metric: 'navigation_timing',
          });
        }
      });
    } catch (error) {
      console.error('Failed to initialize Web Vitals:', error);
    }
  }

  /**
   * Track app startup time
   */
  private trackAppStartup() {
    window.addEventListener('load', () => {
      const startupTime = Date.now() - this.appStartTime;
      analytics.track('app_opened', {
        app_startup_time_ms: startupTime,
      });
    });
  }

  /**
   * Create a performance mark
   */
  public mark(name: string) {
    const mark: PerformanceMark = {
      name,
      timestamp: Date.now(),
    };

    this.marks.set(name, mark);
    performance.mark(name);
  }

  /**
   * Create a performance measure between two marks
   */
  public measure(name: string, startMark: string, endMark?: string) {
    try {
      const end = endMark || `${name}-end`;
      if (!endMark) {
        this.mark(end);
      }

      performance.measure(name, startMark, end);

      const measureEntry = performance.getEntriesByName(name, 'measure')[0];
      if (measureEntry) {
        const measure: PerformanceMeasure = {
          name,
          duration: measureEntry.duration,
          startMark,
          endMark: end,
        };

        this.measures.push(measure);
        return measure;
      }
    } catch (error) {
      console.error('Failed to create measure:', error);
    }

    return null;
  }

  /**
   * Time an async operation
   */
  public async timeOperation<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    const startMark = `${operationName}-start`;
    const endMark = `${operationName}-end`;

    this.mark(startMark);

    try {
      const result = await operation();
      this.mark(endMark);
      const measure = this.measure(operationName, startMark, endMark);

      if (measure) {
        analytics.track('automation_executed', {
          operation: operationName,
          duration_ms: measure.duration,
          success: true,
        });
      }

      return result;
    } catch (error) {
      this.mark(endMark);
      const measure = this.measure(operationName, startMark, endMark);

      if (measure) {
        analytics.track('automation_executed', {
          operation: operationName,
          duration_ms: measure.duration,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      throw error;
    }
  }

  /**
   * Track API response time
   */
  public trackApiCall(endpoint: string, duration: number, success: boolean) {
    analytics.track('api_call_made', {
      endpoint,
      duration_ms: duration,
      success,
    });
  }

  /**
   * Track automation execution time
   */
  public trackAutomationExecution(automationId: string, duration: number, success: boolean) {
    analytics.track('automation_executed', {
      automation_id: automationId,
      duration_ms: duration,
      success,
    });
  }

  /**
   * Track goal execution time
   */
  public trackGoalExecution(
    goalId: string,
    duration: number,
    success: boolean,
    stepsCount?: number,
  ) {
    analytics.track('goal_completed', {
      goal_id: goalId,
      duration_ms: duration,
      success,
      steps_count: stepsCount,
    });
  }

  /**
   * Get all performance metrics
   */
  public async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const systemMetrics = await this.getSystemMetrics();

    return {
      marks: Array.from(this.marks.values()),
      measures: this.measures,
      memory_used_mb: systemMetrics.memory_used_mb,
      cpu_usage_percent: systemMetrics.cpu_usage,
    };
  }

  /**
   * Get system metrics from backend
   */
  public async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      return await invoke<SystemMetrics>('metrics_get_system');
    } catch (error) {
      console.error('Failed to get system metrics:', error);
      return {
        cpu_usage: 0,
        memory_used_mb: 0,
        memory_total_mb: 0,
        disk_used_gb: 0,
        disk_total_gb: 0,
        network_rx_bytes: 0,
        network_tx_bytes: 0,
        uptime_seconds: 0,
      };
    }
  }

  /**
   * Get app metrics from backend
   */
  public async getAppMetrics(): Promise<AppMetrics> {
    try {
      return await invoke<AppMetrics>('metrics_get_app');
    } catch (error) {
      console.error('Failed to get app metrics:', error);
      return {
        automations_count: 0,
        goals_count: 0,
        mcp_servers_count: 0,
        cache_hit_rate: 0,
        avg_goal_duration_ms: 0,
        active_sessions: 0,
        total_api_calls: 0,
        failed_operations: 0,
      };
    }
  }

  /**
   * Monitor memory usage
   */
  public async monitorMemory(interval: number = 5000) {
    setInterval(async () => {
      try {
        const metrics = await this.getSystemMetrics();
        const memoryUsagePercent = (metrics.memory_used_mb / metrics.memory_total_mb) * 100;

        // Alert if memory usage is high
        if (memoryUsagePercent > 80) {
          console.warn(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
          analytics.track('error_occurred', {
            error_type: 'high_memory_usage',
            memory_usage_percent: memoryUsagePercent,
            severity: 'medium',
          });
        }
      } catch (error) {
        console.error('Failed to monitor memory:', error);
      }
    }, interval);
  }

  /**
   * Get performance summary
   */
  public getPerformanceSummary() {
    const avgMeasureDuration =
      this.measures.length > 0
        ? this.measures.reduce((sum, m) => sum + m.duration, 0) / this.measures.length
        : 0;

    return {
      total_marks: this.marks.size,
      total_measures: this.measures.length,
      avg_measure_duration_ms: avgMeasureDuration,
      slowest_measure: this.measures.reduce(
        (slowest, m) => (m.duration > slowest.duration ? m : slowest),
        { name: '', duration: 0, startMark: '', endMark: '' },
      ),
    };
  }

  /**
   * Clear all performance data
   */
  public clear() {
    this.marks.clear();
    this.measures = [];
    performance.clearMarks();
    performance.clearMeasures();
  }

  /**
   * Export performance data
   */
  public exportData() {
    return {
      marks: Array.from(this.marks.values()),
      measures: this.measures,
      summary: this.getPerformanceSummary(),
      app_start_time: this.appStartTime,
    };
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitoringService();

// Export for testing
export { PerformanceMonitoringService };
