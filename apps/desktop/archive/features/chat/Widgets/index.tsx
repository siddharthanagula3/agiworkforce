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

import {
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
};

export interface WidgetActionEvent {
  widgetId: string;
  action: string;
  payload?: unknown;
}

export interface WidgetRendererProps<T = unknown> {
  widget: T;
  messageId?: string;
  onAction?: (event: WidgetActionEvent) => void;
  readOnly?: boolean;
  className?: string;
}

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

export interface DiffViewerWidgetData {
  id: string;
  type: 'diff-viewer';
  oldContent: string;
  newContent: string;
  fileName?: string;
  filePath?: string;
  language?: string;
  viewMode?: 'split' | 'unified';
  showLineNumbers?: boolean;
  highlightChanges?: boolean;
  enableRevert?: boolean;
  createdAt?: string;
}

const Registry = WidgetRegistry;

export const widgetRegistry = {
  register: <T,>(
    type: string,
    component: React.ComponentType<WidgetRendererProps<T>>,
    displayName: string,
    _icon?: React.ComponentType<{ className?: string; size?: number }>,
  ): void => {
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

let widgetIdCounter = 0;

function generateWidgetId(): string {
  return `widget-${Date.now()}-${++widgetIdCounter}`;
}

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

export function createDiffViewerWidget(
  oldContent: string,
  newContent: string,
  options?: {
    id?: string;
    fileName?: string;
    filePath?: string;
    language?: string;
    viewMode?: 'split' | 'unified';
    showLineNumbers?: boolean;
    highlightChanges?: boolean;
    enableRevert?: boolean;
  },
): DiffViewerWidgetData {
  return {
    id: options?.id || generateWidgetId(),
    type: 'diff-viewer',
    oldContent,
    newContent,
    fileName: options?.fileName,
    filePath: options?.filePath,
    language: options?.language,
    viewMode: options?.viewMode ?? 'split',
    showLineNumbers: options?.showLineNumbers ?? true,
    highlightChanges: options?.highlightChanges ?? true,
    enableRevert: options?.enableRevert ?? false,
    createdAt: new Date().toISOString(),
  };
}

export { FormWidget, type FormWidgetProps } from './FormWidget';

export { DataTableWidget } from './DataTableWidget';

export { ChartWidget } from './ChartWidget';

export { DiffWidget } from './DiffWidget';

export {
  ConfirmationWidget,
  createConfirmationWidget,
  type ConfirmationWidgetData,
} from './ConfirmationWidget';

export { WidgetRenderer } from './WidgetRenderer';

import { FormWidget } from './FormWidget';

Registry.register({
  type: 'form',
  displayName: 'Form',
  description: 'Embedded form for collecting user input with validation',

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- widget registration: props vary by API
  component: FormWidget as React.ComponentType<any>,
  icon: FileText,
});

