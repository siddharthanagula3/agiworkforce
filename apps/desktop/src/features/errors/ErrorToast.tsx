import { AlertCircle, AlertTriangle, CheckCircle, Info, X, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import useErrorStore, { type AppError, type ErrorSeverity } from '../../stores/ui';
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
    bgClass: 'bg-warning-fill/10',
    iconClass: 'text-warning-text',
    borderClass: 'border-warning-fill/30',
  },
  error: {
    icon: AlertCircle,
    bgClass: 'bg-danger-fill/10',
    iconClass: 'text-danger-text',
    borderClass: 'border-danger-fill/30',
  },
  critical: {
    icon: AlertCircle,
    bgClass: 'bg-danger-fill/10',
    iconClass: 'text-danger-text',
    borderClass: 'border-danger-fill/30',
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
  const { t } = useTranslation();
  const errorDef = getErrorMessage(error.type, t);

  return (
    <div
      className={`mb-3 flex items-start gap-3 rounded-lg border p-4 shadow-e3 transition-all ${config.bgClass} ${config.borderClass}`}
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
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{errorDef.message}</p>

            {import.meta.env.DEV && error.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  {t('errors:toast.showDetails')}
                </summary>
                <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {error.details}
                </p>
              </details>
            )}

            {errorDef.suggestions.length > 0 && (
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
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label={t('errors:toast.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {(onRetry || errorDef.helpLink) && (
          <div className="mt-3 flex gap-2">
            {onRetry && errorDef.recoverable && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 rounded bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-xs hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RefreshCw className="h-3 w-3" />
                {t('errors:toast.retry')}
              </button>
            )}

            {errorDef.helpLink && (
              <a
                href={errorDef.helpLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-xs hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t('errors:toast.learnMore')}
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

export function ErrorToastContainer({ position = 'top-right', onRetry }: ErrorToastContainerProps) {
  const { toasts, dismissError } = useErrorStore(
    useShallow((s) => ({ toasts: s.toasts, dismissError: s.dismissError })),
  );

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
    showError: (
      type: string,
      message: string,
      details?: string,
      context?: Record<string, unknown>,
    ) => {
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
      context?: Record<string, unknown>,
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
