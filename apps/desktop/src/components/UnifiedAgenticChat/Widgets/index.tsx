/**
 * Widgets Module
 *
 * Central module for chat-embedded widgets including forms, tables, charts, and more.
 * Provides widget registration, rendering, and type definitions.
 *
 * @module Widgets
 */

import React from 'react';
import { FileText } from 'lucide-react';

// ============================================================================
// Re-export from WidgetRegistry
// ============================================================================

export {
  WidgetRegistry,
  useWidgetRegistry,
  createWidgetData,
  type WidgetType,
  type BaseWidgetConfig,
  type BaseWidgetProps,
  type WidgetDefinition,
  type RegisteredWidget,
  type WidgetData,
} from './WidgetRegistry';

// ============================================================================
// Action Event Types
// ============================================================================

/**
 * Action event emitted by widgets
 */
export interface WidgetActionEvent {
  widgetId: string;
  action: string;
  payload?: unknown;
}

/**
 * Common widget renderer props for unified rendering
 */
export interface WidgetRendererProps<T = unknown> {
  widget: T;
  messageId?: string;
  onAction?: (event: WidgetActionEvent) => void;
  readOnly?: boolean;
  className?: string;
}

// ============================================================================
// Form Widget Types (INT-003)
// ============================================================================

export type FormFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'file';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  accept?: string;
}

export interface FormField {
  name: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
  description?: string;
  disabled?: boolean;
}

export interface FormWidgetConfig {
  title?: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  cancelLabel?: string;
}

export type FormData = Record<string, string | number | boolean | File | null>;

export interface FormWidgetData {
  id: string;
  type: 'form';
  config: FormWidgetConfig;
  createdAt?: string;
  state?: {
    submitted?: boolean;
    data?: FormData;
    initialValues?: Partial<FormData>;
  };
  interactive?: boolean;
}

// ============================================================================
// Data Table Widget Types
// ============================================================================

export interface DataTableColumn {
  key: string;
  label: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

export interface DataTableWidgetData {
  id: string;
  type: 'data-table';
  columns: DataTableColumn[];
  rows: Record<string, unknown>[];
  createdAt?: string;
  sortable?: boolean;
  filterable?: boolean;
  pageSize?: number;
  totalRows?: number;
}

// ============================================================================
// Chart Widget Types
// ============================================================================

export type ChartType = 'bar' | 'line' | 'pie' | 'area';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ChartWidgetData {
  id: string;
  type: 'chart';
  chartType: ChartType;
  title: string;
  data: ChartDataPoint[];
  createdAt?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  showValues?: boolean;
}

// ============================================================================
// Legacy Widget Registry (for compatibility with DataTableWidget/ChartWidget)
// ============================================================================

import {
  WidgetRegistry as Registry,
  type WidgetDefinition,
  type BaseWidgetConfig,
  type BaseWidgetProps,
} from './WidgetRegistry';

// Alias for components that use the old `widgetRegistry` name
export const widgetRegistry = {
  register: <T,>(
    type: string,
    component: React.ComponentType<WidgetRendererProps<T>>,
    displayName: string,
    _icon?: React.ComponentType<{ className?: string; size?: number }>,
  ): void => {
    // AUDIT-P3-TYPE: Legacy API bridge between two different widget prop interfaces.
    // WidgetRendererProps<T> (runtime): { widget, messageId, onAction, readOnly, className }
    // BaseWidgetProps (registry): { config, onSubmit, onCancel, readOnly, ... }
    // The cast through unknown is required because these are intentionally different
    // interfaces serving different purposes:
    // - BaseWidgetProps is the "official" registration interface
    // - WidgetRendererProps is what WidgetRenderer actually passes at runtime
    // This mismatch is a known design debt tracked for future refactoring.
    const definition: WidgetDefinition = {
      type,
      displayName,
      component: component as unknown as React.ComponentType<BaseWidgetProps<BaseWidgetConfig>>,
    };
    Registry.register(definition);
  },
  get: Registry.get.bind(Registry),
  has: Registry.has.bind(Registry),
  getAll: Registry.getAll.bind(Registry),
};

// ============================================================================
// Widget Data Factories
// ============================================================================

let widgetIdCounter = 0;

function generateWidgetId(): string {
  return `widget-${Date.now()}-${++widgetIdCounter}`;
}

/**
 * Create a form widget data object
 */
export function createFormWidget(
  config: FormWidgetConfig,
  options?: {
    id?: string;
    initialValues?: Partial<FormData>;
    interactive?: boolean;
  },
): FormWidgetData {
  return {
    id: options?.id || generateWidgetId(),
    type: 'form',
    config,
    createdAt: new Date().toISOString(),
    state: options?.initialValues ? { initialValues: options.initialValues } : undefined,
    interactive: options?.interactive ?? true,
  };
}

/**
 * Create a data table widget data object
 */
export function createDataTableWidget(
  columns: DataTableColumn[],
  rows: Record<string, unknown>[],
  options?: {
    id?: string;
    sortable?: boolean;
    filterable?: boolean;
    pageSize?: number;
    totalRows?: number;
  },
): DataTableWidgetData {
  return {
    id: options?.id || generateWidgetId(),
    type: 'data-table',
    columns,
    rows,
    createdAt: new Date().toISOString(),
    sortable: options?.sortable ?? true,
    filterable: options?.filterable ?? true,
    pageSize: options?.pageSize ?? 10,
    totalRows: options?.totalRows,
  };
}

/**
 * Create a chart widget data object
 */
export function createChartWidget(
  chartType: ChartType,
  title: string,
  data: ChartDataPoint[],
  options?: {
    id?: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
    showLegend?: boolean;
    showValues?: boolean;
  },
): ChartWidgetData {
  return {
    id: options?.id || generateWidgetId(),
    type: 'chart',
    chartType,
    title,
    data,
    createdAt: new Date().toISOString(),
    xAxisLabel: options?.xAxisLabel,
    yAxisLabel: options?.yAxisLabel,
    showLegend: options?.showLegend ?? true,
    showValues: options?.showValues ?? true,
  };
}

// ============================================================================
// Component Exports
// ============================================================================

// Export FormWidget
export { FormWidget, type FormWidgetProps } from './FormWidget';

// Export DataTableWidget
export { DataTableWidget } from './DataTableWidget';

// Export ChartWidget
export { ChartWidget } from './ChartWidget';

// Export ConfirmationWidget
export {
  ConfirmationWidget,
  createConfirmationWidget,
  type ConfirmationWidgetData,
} from './ConfirmationWidget';

// Export WidgetRenderer
export { WidgetRenderer } from './WidgetRenderer';

// ============================================================================
// Widget Registration
// ============================================================================

// Import and register widgets (done after exports to avoid circular deps)
import { FormWidget } from './FormWidget';

// Register FormWidget with the main registry
Registry.register({
  type: 'form',
  displayName: 'Form',
  description: 'Embedded form for collecting user input with validation',

  component: FormWidget as React.ComponentType<any>,
  icon: FileText,
});

// Note: DataTableWidget and ChartWidget register themselves in their own files
