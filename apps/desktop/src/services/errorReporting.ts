import { invoke } from '@tauri-apps/api/core';
import type { AppError } from '../stores/errorStore';

interface SystemInfo {
  platform: string;
  osVersion: string;
  appVersion: string;
  architecture: string;
  locale: string;
}

interface ErrorReport {
  error_type: string;
  message: string;
  stack_trace?: string;
  context: Record<string, unknown>;
  timestamp: number;
}

interface ErrorReportingOptions {
  /**
   * Whether error reporting is enabled
   */
  enabled: boolean;

  /**
   * Batch size for sending errors
   */
  batchSize: number;

  /**
   * Interval in milliseconds to send batched errors
   */
  batchInterval: number;

  /**
   * Whether to respect user privacy settings
   */
  respectPrivacy: boolean;

  /**
   * Whether to include system information
   */
  includeSystemInfo: boolean;

  /**
   * Whether to include user actions (breadcrumbs)
   */
  includeUserActions: boolean;
}

class ErrorReportingService {
  private queue: AppError[] = [];
  private batchTimer: number | null = null;
  private systemInfo: SystemInfo | null = null;
  private userActions: Array<{ action: string; timestamp: number }> = [];
  private maxUserActions = 20;

  private options: ErrorReportingOptions = {
    enabled: true,
    batchSize: 10,
    batchInterval: 5 * 60 * 1000, // 5 minutes
    respectPrivacy: true,
    includeSystemInfo: true,
    includeUserActions: true,
  };

  constructor() {
    this.initializeSystemInfo();
  }

  /**
   * Initialize system information
   */
  private async initializeSystemInfo(): Promise<void> {
    try {
      this.systemInfo = {
        platform: navigator.platform,
        osVersion: navigator.userAgent,
        appVersion: import.meta.env['VITE_APP_VERSION'] || 'unknown',
        architecture: navigator.userAgent.includes('x64') ? 'x64' : 'x86',
        locale: navigator.language,
      };
    } catch (error) {
      console.error('Failed to initialize system info:', error);
    }
  }

  /**
   * Configure error reporting
   */
  configure(options: Partial<ErrorReportingOptions>): void {
    this.options = { ...this.options, ...options };

    // Restart batch timer if interval changed
    if (this.batchTimer !== null) {
      window.clearInterval(this.batchTimer);
      this.startBatchTimer();
    }
  }

  /**
   * Check if error reporting is enabled
   */
  isEnabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Track a user action (breadcrumb)
   */
  trackAction(action: string): void {
    if (!this.options.includeUserActions) {
      return;
    }

    this.userActions.push({
      action,
      timestamp: Date.now(),
    });

    // Keep only last N actions
    if (this.userActions.length > this.maxUserActions) {
      this.userActions = this.userActions.slice(-this.maxUserActions);
    }
  }

  /**
   * Report an error
   */
  async reportError(error: AppError): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    // Check privacy settings
    if (this.options.respectPrivacy && this.shouldFilterError(error)) {
      console.log('Error filtered due to privacy settings:', error.type);
      return;
    }

    // Add to queue
    this.queue.push(error);

    // Send immediately if critical or batch size reached
    if (error.severity === 'critical' || this.queue.length >= this.options.batchSize) {
      await this.sendBatch();
    } else {
      // Start batch timer if not already running
      if (this.batchTimer === null) {
        this.startBatchTimer();
      }
    }
  }

  /**
   * Check if error should be filtered based on privacy settings
   */
  private shouldFilterError(error: AppError): boolean {
    // Filter errors that might contain sensitive information
    const sensitivePatterns = [
      /api[_-]?key/i,
      /password/i,
      /token/i,
      /secret/i,
      /credential/i,
      /private[_-]?key/i,
    ];

    const errorString = JSON.stringify(error);
    return sensitivePatterns.some((pattern) => pattern.test(errorString));
  }

  /**
   * Start batch timer
   */
  private startBatchTimer(): void {
    this.batchTimer = window.setInterval(() => {
      if (this.queue.length > 0) {
        void this.sendBatch();
      }
    }, this.options.batchInterval);
  }

  /**
   * Send batched errors to backend
   */
  private async sendBatch(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const errors = [...this.queue];
    this.queue = [];

    try {
      // Build error reports
      const reports: ErrorReport[] = errors.map((error) => {
        const context: Record<string, unknown> = {
          ...error.context,
        };

        // Add system info if enabled
        if (this.options.includeSystemInfo && this.systemInfo) {
          context['system'] = this.systemInfo;
        }

        // Add user actions if enabled
        if (this.options.includeUserActions && this.userActions.length > 0) {
          context['userActions'] = this.userActions;
        }

        return {
          error_type: error.type,
          message: error.message,
          stack_trace: error.stack,
          context,
          timestamp: error.timestamp,
        };
      });

      // Send to backend
      await invoke('error_report_batch', { reports });

      console.log(`Successfully reported ${reports.length} errors`);
    } catch (error) {
      console.error('Failed to send error batch:', error);

      // Re-queue errors if send failed (but limit queue size)
      this.queue = [...errors, ...this.queue].slice(0, 50);
    }
  }

  /**
   * Send all queued errors immediately
   */
  async flush(): Promise<void> {
    await this.sendBatch();

    if (this.batchTimer !== null) {
      window.clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Clear all queued errors
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Export error report as JSON
   */
  exportReport(error: AppError): string {
    const context: Record<string, unknown> = {
      ...error.context,
    };

    if (this.options.includeSystemInfo && this.systemInfo) {
      context['system'] = this.systemInfo;
    }

    if (this.options.includeUserActions && this.userActions.length > 0) {
      context['userActions'] = this.userActions;
    }

    const report = {
      error_type: error.type,
      severity: error.severity,
      message: error.message,
      details: error.details,
      stack: error.stack,
      timestamp: new Date(error.timestamp).toISOString(),
      context,
    };

    return JSON.stringify(report, null, 2);
  }
}

// Singleton instance
export const errorReportingService = new ErrorReportingService();

export default errorReportingService;
