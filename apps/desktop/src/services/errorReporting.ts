import { invoke } from '../lib/tauri-mock';
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
  enabled: boolean;

  batchSize: number;

  batchInterval: number;

  respectPrivacy: boolean;

  includeSystemInfo: boolean;

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
    batchInterval: 5 * 60 * 1000,
    respectPrivacy: true,
    includeSystemInfo: true,
    includeUserActions: true,
  };

  constructor() {
    this.initializeSystemInfoSync();
  }

  private initializeSystemInfoSync(): void {
    try {
      if (typeof navigator !== 'undefined') {
        this.systemInfo = {
          platform: navigator.platform || 'unknown',
          osVersion: navigator.userAgent || 'unknown',
          appVersion: import.meta.env['VITE_APP_VERSION'] || 'unknown',
          architecture: navigator.userAgent?.includes('x64') ? 'x64' : 'x86',
          locale: navigator.language || 'en-US',
        };
      } else {
        this.systemInfo = {
          platform: 'unknown',
          osVersion: 'unknown',
          appVersion: import.meta.env['VITE_APP_VERSION'] || 'unknown',
          architecture: 'unknown',
          locale: 'en-US',
        };
      }
    } catch (error) {
      console.error('Failed to initialize system info:', error);
      this.systemInfo = {
        platform: 'unknown',
        osVersion: 'unknown',
        appVersion: 'unknown',
        architecture: 'unknown',
        locale: 'en-US',
      };
    }
  }

  configure(options: Partial<ErrorReportingOptions>): void {
    this.options = { ...this.options, ...options };

    if (this.batchTimer !== null) {
      window.clearInterval(this.batchTimer);
      this.startBatchTimer();
    }
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  trackAction(action: string): void {
    if (!this.options.includeUserActions) {
      return;
    }

    this.userActions.push({
      action,
      timestamp: Date.now(),
    });

    if (this.userActions.length > this.maxUserActions) {
      this.userActions = this.userActions.slice(-this.maxUserActions);
    }
  }

  async reportError(error: AppError): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    if (this.options.respectPrivacy && this.shouldFilterError(error)) {
      return;
    }

    this.queue.push(error);

    if (error.severity === 'critical' || this.queue.length >= this.options.batchSize) {
      await this.sendBatch();
    } else {
      if (this.batchTimer === null) {
        this.startBatchTimer();
      }
    }
  }

  private shouldFilterError(error: AppError): boolean {
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

  private startBatchTimer(): void {
    this.batchTimer = window.setInterval(() => {
      if (this.queue.length > 0) {
        void this.sendBatch();
      }
    }, this.options.batchInterval);
  }

  private async sendBatch(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const errors = [...this.queue];
    this.queue = [];

    try {
      const reports: ErrorReport[] = errors.map((error) => {
        const context: Record<string, unknown> = {
          ...error.context,
        };

        if (this.options.includeSystemInfo && this.systemInfo) {
          context['system'] = this.systemInfo;
        }

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

      await invoke('error_report_batch', { reports });
    } catch (error) {
      console.error('Failed to send error batch:', error);

      const combined = [...errors, ...this.queue];
      if (combined.length > 50) {
        const droppedCount = combined.length - 50;
        console.warn(`[ErrorReporting] Queue full, dropping ${droppedCount} oldest error(s)`);
      }
      this.queue = combined.slice(0, 50);
    }
  }

  async flush(): Promise<void> {
    await this.sendBatch();

    if (this.batchTimer !== null) {
      window.clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  clearQueue(): void {
    this.queue = [];
  }

  getQueueSize(): number {
    return this.queue.length;
  }

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

export const errorReportingService = new ErrorReportingService();

export default errorReportingService;
