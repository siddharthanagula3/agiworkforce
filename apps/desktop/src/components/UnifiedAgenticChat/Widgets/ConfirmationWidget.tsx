/**
 * ConfirmationWidget Component
 *
 * Yes/No confirmation widget for user decisions.
 * Supports different visual variants for severity levels.
 *
 * @module Widgets/ConfirmationWidget
 */

import React, { memo, useState, useCallback } from 'react';
import { Check, X, AlertTriangle, HelpCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { WidgetRendererProps, WidgetActionEvent, widgetRegistry } from './index';

// ============================================================================
// Types
// ============================================================================

export interface ConfirmationWidgetData {
  id: string;
  type: 'confirmation';
  createdAt?: string;
  /** Main message to display */
  message: string;
  /** Additional details or context */
  details?: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Visual variant for severity */
  variant?: 'default' | 'warning' | 'danger' | 'info';
  /** Action ID to include in response */
  actionId?: string;
  /** Current state of the confirmation */
  state?: {
    status: 'pending' | 'confirmed' | 'cancelled';
    confirmedAt?: string;
  };
}

// ============================================================================
// Component
// ============================================================================

const ConfirmationWidgetComponent: React.FC<WidgetRendererProps<ConfirmationWidgetData>> = ({
  widget,
  onAction,
  readOnly = false,
}) => {
  const {
    message,
    details,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    actionId,
    state,
  } = widget;

  const [isLoading, setIsLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<'pending' | 'confirmed' | 'cancelled'>(
    state?.status ?? 'pending',
  );

  const isPending = localStatus === 'pending';
  const isConfirmed = localStatus === 'confirmed';
  const isCancelled = localStatus === 'cancelled';

  // Emit action
  const emitAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      const event: WidgetActionEvent = {
        widgetId: widget.id,
        action,
        payload: { actionId, ...(payload ?? {}) },
      };
      onAction?.(event);
    },
    [widget.id, actionId, onAction],
  );

  // Handle confirm
  const handleConfirm = useCallback(async () => {
    if (!isPending || readOnly || isLoading) return;

    setIsLoading(true);
    try {
      emitAction('confirm', { confirmed: true });
      setLocalStatus('confirmed');
    } finally {
      setIsLoading(false);
    }
  }, [isPending, readOnly, isLoading, emitAction]);

  // Handle cancel
  const handleCancel = useCallback(async () => {
    if (!isPending || readOnly || isLoading) return;

    setIsLoading(true);
    try {
      emitAction('cancel', { confirmed: false });
      setLocalStatus('cancelled');
    } finally {
      setIsLoading(false);
    }
  }, [isPending, readOnly, isLoading, emitAction]);

  // Variant styles
  const variantStyles = {
    default: {
      container: 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50',
      icon: <HelpCircle className="h-5 w-5 text-blue-500" />,
      confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    warning: {
      container: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      confirmButton: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    danger: {
      container: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
      icon: <AlertCircle className="h-5 w-5 text-red-500" />,
      confirmButton: 'bg-red-600 hover:bg-red-700 text-white',
    },
    info: {
      container: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
      icon: <HelpCircle className="h-5 w-5 text-blue-500" />,
      confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };

  const styles = variantStyles[variant];

  // Confirmed state
  if (isConfirmed) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Confirmed</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>
        </div>
      </div>
    );
  }

  // Cancelled state
  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
          <X className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Cancelled</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">{message}</p>
        </div>
      </div>
    );
  }

  // Pending state - show confirmation UI
  return (
    <div className={cn('rounded-lg border overflow-hidden', styles.container)}>
      {/* Content */}
      <div className="flex gap-3 p-4">
        <div className="shrink-0 mt-0.5">{styles.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{message}</p>
          {details && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{details}</p>}
        </div>
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-inherit bg-white/50 dark:bg-black/20">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              styles.confirmButton,
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {confirmLabel}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600',
              'text-zinc-700 dark:text-zinc-300',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            <X className="h-4 w-4" />
            {cancelLabel}
          </button>
        </div>
      )}
    </div>
  );
};

ConfirmationWidgetComponent.displayName = 'ConfirmationWidget';

export const ConfirmationWidget = memo(ConfirmationWidgetComponent);

// Register the widget
widgetRegistry.register<ConfirmationWidgetData>(
  'confirmation',
  ConfirmationWidget,
  'Confirmation',
  HelpCircle,
);

/**
 * Create a confirmation widget data object
 */
export function createConfirmationWidget(
  message: string,
  options?: {
    id?: string;
    details?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'warning' | 'danger' | 'info';
    actionId?: string;
  },
): ConfirmationWidgetData {
  return {
    id: options?.id ?? `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'confirmation',
    message,
    details: options?.details,
    confirmLabel: options?.confirmLabel,
    cancelLabel: options?.cancelLabel,
    variant: options?.variant ?? 'default',
    actionId: options?.actionId,
    createdAt: new Date().toISOString(),
  };
}
