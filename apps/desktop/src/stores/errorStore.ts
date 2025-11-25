import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AppError {
  id: string;
  type: string;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  stack?: string;
  timestamp: number;
  context?: Record<string, unknown>;
  dismissed: boolean;
  count: number; // Number of times this error occurred
}

export interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: AppError[];
}

interface ErrorStore {
  errors: AppError[];
  maxHistorySize: number;
  toasts: AppError[];
  maxToasts: number;

  // Actions
  addError: (error: Omit<AppError, 'id' | 'timestamp' | 'dismissed' | 'count'>) => void;
  dismissError: (id: string) => void;
  dismissAll: () => void;
  clearHistory: () => void;
  getStatistics: () => ErrorStatistics;
  exportLogs: () => Promise<string>;
  reportError: (errorId: string) => Promise<void>;
}

const useErrorStore = create<ErrorStore>()(
  devtools(
    (set, get) => ({
      errors: [],
      maxHistorySize: 100,
      toasts: [],
      maxToasts: 5,

      addError: (errorData) => {
        const { errors, toasts, maxHistorySize, maxToasts } = get();

        // Check if this error already exists (within last 5 seconds)
        const now = Date.now();
        const existingError = errors.find(
          (e) =>
            e.type === errorData.type &&
            e.message === errorData.message &&
            !e.dismissed &&
            now - e.timestamp < 5000,
        );

        if (existingError) {
          // Increment count instead of creating duplicate
          set({
            errors: errors.map((e) =>
              e.id === existingError.id ? { ...e, count: e.count + 1, timestamp: now } : e,
            ),
            toasts: toasts.map((e) =>
              e.id === existingError.id ? { ...e, count: e.count + 1, timestamp: now } : e,
            ),
          });
          return;
        }

        const newError: AppError = {
          ...errorData,
          id: `error_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          timestamp: now,
          dismissed: false,
          count: 1,
        };

        // Add to history (trim if needed)
        const newErrors = [newError, ...errors].slice(0, maxHistorySize);

        // Add to toasts if not dismissed
        const newToasts = [newError, ...toasts].slice(0, maxToasts);

        set({ errors: newErrors, toasts: newToasts });

        // Auto-dismiss info and warning toasts after delay
        if (errorData.severity === 'info' || errorData.severity === 'warning') {
          const duration = errorData.severity === 'info' ? 3000 : 5000;
          setTimeout(() => {
            get().dismissError(newError.id);
          }, duration);
        }

        // Report critical errors automatically
        if (errorData.severity === 'critical') {
          void get().reportError(newError.id);
        }

        // Log to console in development
        if (import.meta.env.DEV) {
          const consoleMethod =
            errorData.severity === 'critical' || errorData.severity === 'error'
              ? console.error
              : errorData.severity === 'warning'
                ? console.warn
                : console.info;

          consoleMethod(`[${errorData.severity.toUpperCase()}] ${errorData.message}`, {
            type: errorData.type,
            details: errorData.details,
            context: errorData.context,
            stack: errorData.stack,
          });
        }
      },

      dismissError: (id) => {
        set((state) => ({
          errors: state.errors.map((e) => (e.id === id ? { ...e, dismissed: true } : e)),
          toasts: state.toasts.filter((e) => e.id !== id),
        }));
      },

      dismissAll: () => {
        set((state) => ({
          errors: state.errors.map((e) => ({ ...e, dismissed: true })),
          toasts: [],
        }));
      },

      clearHistory: () => {
        set({ errors: [], toasts: [] });
      },

      getStatistics: () => {
        const { errors } = get();

        const stats: ErrorStatistics = {
          totalErrors: errors.length,
          errorsByType: {},
          errorsBySeverity: {
            info: 0,
            warning: 0,
            error: 0,
            critical: 0,
          },
          recentErrors: errors.slice(0, 10),
        };

        errors.forEach((error) => {
          // Count by type
          stats.errorsByType[error.type] = (stats.errorsByType[error.type] || 0) + error.count;

          // Count by severity
          stats.errorsBySeverity[error.severity] += error.count;
        });

        return stats;
      },

      exportLogs: async () => {
        const { errors } = get();

        const logs = errors.map((error) => ({
          id: error.id,
          type: error.type,
          severity: error.severity,
          message: error.message,
          details: error.details,
          timestamp: new Date(error.timestamp).toISOString(),
          context: error.context,
          count: error.count,
        }));

        return JSON.stringify(logs, null, 2);
      },

      reportError: async (errorId) => {
        const { errors } = get();
        const error = errors.find((e) => e.id === errorId);

        if (!error) {
          console.warn('Error not found for reporting:', errorId);
          return;
        }

        try {
          await invoke('error_report', {
            errorData: {
              error_type: error.type,
              message: error.message,
              stack_trace: error.stack,
              context: error.context || {},
              timestamp: error.timestamp,
            },
          });
        } catch (err) {
          console.error('Failed to report error to backend:', err);
        }
      },
    }),
    { name: 'ErrorStore' },
  ),
);

export default useErrorStore;
