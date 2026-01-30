/**
 * WidgetRenderer Component
 *
 * Renders a widget based on its type from the registry.
 * Handles loading, errors, and widget lifecycle.
 *
 * @module Widgets/WidgetRenderer
 */

import React, { memo, Suspense, useCallback } from 'react';
import { AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { widgetRegistry, WidgetType, WidgetActionEvent } from './index';

// ============================================================================
// Types
// ============================================================================

/**
 * Generic widget data - accepts any shape with id and type.
 * This allows the renderer to work with different widget data formats.
 */
export interface GenericWidgetData {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface WidgetRendererComponentProps {
  /** Widget data containing type and configuration */
  widget: GenericWidgetData;
  /** Called when widget emits an action */
  onAction?: (event: WidgetActionEvent) => void;
  /** Whether the widget is read-only */
  readOnly?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Message ID this widget belongs to */
  messageId?: string;
}

// ============================================================================
// Loading Fallback
// ============================================================================

function WidgetLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading widget...</span>
    </div>
  );
}

// ============================================================================
// Error Boundary
// ============================================================================

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  widgetType: WidgetType;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class WidgetErrorBoundary extends React.Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Widget error (${this.props.widgetType}):`, error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Widget Error</p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Something went wrong displaying this widget. Please try again later.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Unknown Widget Fallback
// ============================================================================

interface UnknownWidgetProps {
  type: string;
}

function UnknownWidget({ type }: UnknownWidgetProps) {
  return (
    <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
      <HelpCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Unknown Widget</p>
        <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
          Widget type "{type}" is not recognized.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

const WidgetRendererComponent: React.FC<WidgetRendererComponentProps> = ({
  widget,
  onAction,
  readOnly = false,
  className,
  messageId,
}) => {
  // Get the registered widget
  const registeredWidget = widgetRegistry.get(widget.type);

  // Handle widget action
  const handleAction = useCallback(
    (event: WidgetActionEvent) => {
      onAction?.(event);
    },
    [onAction],
  );

  // If widget type is not registered, show fallback
  if (!registeredWidget) {
    return <UnknownWidget type={widget.type} />;
  }

  const WidgetComponent = registeredWidget.component;

  return (
    <WidgetErrorBoundary widgetType={widget.type}>
      <Suspense fallback={<WidgetLoadingFallback />}>
        <div className={cn('widget-container', className)}>
          <WidgetComponent
            widget={widget}
            messageId={messageId}
            onAction={handleAction}
            readOnly={readOnly}
            className={className}
          />
        </div>
      </Suspense>
    </WidgetErrorBoundary>
  );
};

WidgetRendererComponent.displayName = 'WidgetRenderer';

export const WidgetRenderer = memo(WidgetRendererComponent);

export default WidgetRenderer;
