/**
 * Error Reporting API — typed wrappers for error_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ErrorReport {
  errorType: string;
  message: string;
  stackTrace?: string;
  context: Record<string, unknown>;
  timestamp: number;
}

export interface ErrorStats {
  totalErrors: number;
  criticalErrors: number;
  warnings: number;
  logFileSizeBytes: number;
}

// ---- Commands ----

export async function errorReport(errorData: ErrorReport): Promise<void> {
  return command<void>('error_report', { errorData });
}

export async function errorReportBatch(reports: ErrorReport[]): Promise<void> {
  return command<void>('error_report_batch', { reports });
}

export async function errorGetLogs(lines: number): Promise<string[]> {
  return command<string[]>('error_get_logs', { lines });
}

export async function errorClearLogs(): Promise<void> {
  return command<void>('error_clear_logs');
}

export async function errorGetStats(): Promise<ErrorStats> {
  return command<ErrorStats>('error_get_stats');
}

export async function errorExportLogs(): Promise<string> {
  return command<string>('error_export_logs');
}
