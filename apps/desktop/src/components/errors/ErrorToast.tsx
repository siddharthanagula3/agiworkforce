import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X, RefreshCw } from 'lucide-react';
import useErrorStore, { type AppError, type ErrorSeverity } from '../../stores/errorStore';
import { getErrorMessage } from '../../constants/errorMessages';

const severityConfig: Record<
  ErrorSeverity,
  {
    icon: typeof Info;
    bgClass: string;
    iconClass: string;
    borderClass: string;
  }
> = {
  info: {
    icon: Info,
    bgClass: 'bg-blue-50 dark:bg-blue-950',
    iconClass: 'text-blue-500',
    borderClass: 'border-blue-200 dark:border-blue-800',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-yellow-50 dark:bg-yellow-950',
    iconClass: 'text-yellow-500',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
  },
  error: {
    icon: AlertCircle,
    bgClass: 'bg-red-50 dark:bg-red-950',
    iconClass: 'text-red-500',
    borderClass: 'border-red-200 dark:border-red-800',
  },
  critical: {
    icon: AlertCircle,
    bgClass: 'bg-red-100 dark:bg-red-900',
    iconClass: 'text-red-600',
    borderClass: 'border-red-300 dark:border-red-700',
  },
};

interface ErrorToastItemProps {
  error: AppError;
  onDismiss: () => void;
  onRetry?: () => void;
}

function ErrorToastItem({ error, onDismiss, onRetry }: ErrorToastItemProps) {
  const config = severityConfig[error.severity];
  const Icon = config.icon;
  const errorDef = getErrorMessage(error.type);

  return (
    <div
      className={`mb-3 flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all ${config.bgClass} ${config.borderClass}`}
      role="alert"
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconClass}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
              {errorDef.title}
              {error.count > 1 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {error.count}x
                </span>
              )}
            </h4>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{error.message}</p>

            {error.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  Show details
                </summary>
                <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {error.details}
                </p>
              </details>
            )}

            {errorDef.suggestions && errorDef.suggestions.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                {errorDef.suggestions.slice(0, 2).map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={onDismiss}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {(onRetry || errorDef.helpLink) && (
          <div className="mt-3 flex gap-2">
            {onRetry && errorDef.recoverable && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}

            {errorDef.helpLink && (
              <a
                href={errorDef.helpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Learn more
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ErrorToastContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  onRetry?: (error: AppError) => void;
}

export function ErrorToastContainer({
  position = 'top-right',
  onRetry,
}: ErrorToastContainerProps) {
  const { toasts, dismissError } = useErrorStore();

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none fixed z-50 ${positionClasses[position]} max-w-md w-full`}
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="pointer-events-auto">
        {toasts.map((toast) => (
          <ErrorToastItem
            key={toast.id}
            error={toast}
            onDismiss={() => dismissError(toast.id)}
            onRetry={onRetry ? () => onRetry(toast) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Hook to easily add errors from components
 */
export function useErrorToast() {
  const addError = useErrorStore((state) => state.addError);

  return {
    showInfo: (message: string, details?: string) => {
      addError({
        type: 'UNKNOWN_ERROR',
        severity: 'info',
        message,
        details,
      });
    },
    showWarning: (type: string, message: string, details?: string) => {
      addError({
        type,
        severity: 'warning',
        message,
        details,
      });
    },
    showError: (type: string, message: string, details?: string, context?: Record<string, unknown>) => {
      addError({
        type,
        severity: 'error',
        message,
        details,
        context,
      });
    },
    showCritical: (
      type: string,
      message: string,
      details?: string,
      stack?: string,
      context?: Record<string, unknown>
    ) => {
      addError({
        type,
        severity: 'critical',
        message,
        details,
        stack,
        context,
      });
    },
  };
}

export default ErrorToastContainer;
