/**
 * WidgetRegistry
 *
 * Central registry for chat widgets. Allows registering, retrieving,
 * and managing widget types and their rendering components.
 *
 * @module Widgets/WidgetRegistry
 */

import React, { useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';

export type WidgetType = string;

export interface BaseWidgetConfig {
  [key: string]: unknown;
}

export interface BaseWidgetProps<TConfig = BaseWidgetConfig> {
  config: TConfig;
  onSubmit?: (data: unknown) => void;
  onCancel?: () => void;
  readOnly?: boolean;
  submittedValues?: Record<string, unknown>;
  initialValues?: Record<string, unknown>;
  widgetId: string;
  messageId?: string;
}

export interface WidgetDefinition<
  TConfig extends BaseWidgetConfig = BaseWidgetConfig,
  TProps extends BaseWidgetProps<TConfig> = BaseWidgetProps<TConfig>,
> {
  type: WidgetType;
  displayName: string;
  description?: string;
  component: React.ComponentType<TProps>;
  icon?: LucideIcon;
  defaultConfig?: Partial<TConfig>;
  validateConfig?: (config: TConfig) => string[] | null;
}

export interface RuntimeWidgetProps {
  widget: { id: string; type: string; [key: string]: unknown };
  messageId?: string;
  onAction?: (event: { widgetId: string; action: string; payload?: unknown }) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Registered widget entry in the registry.
 * AUDIT-P3-TYPE: Component type uses 'any' props because widgets can be registered
 * with either BaseWidgetProps (new API) or WidgetRendererProps (legacy API),
 * and WidgetRenderer passes RuntimeWidgetProps at runtime. The actual type
 * safety is enforced at widget implementation level.
 */
export interface RegisteredWidget<
  TConfig extends BaseWidgetConfig = BaseWidgetConfig,
  _TProps extends BaseWidgetProps<TConfig> = BaseWidgetProps<TConfig>,
> {
  type: WidgetType;
  displayName: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional: widget component props vary by registration API
  component: React.ComponentType<any>;
  icon?: LucideIcon;
  defaultConfig?: Partial<TConfig>;
  validateConfig?: (config: TConfig) => string[] | null;
}

export interface WidgetData<TConfig extends BaseWidgetConfig = BaseWidgetConfig> {
  id: string;
  type: WidgetType;
  config: TConfig;
  interactive?: boolean;
  state?: {
    data?: unknown;
    initialValues?: Record<string, unknown>;
    submitted?: boolean;
  };
  createdAt?: string;
}

type RegistryListener = () => void;

class WidgetRegistryImpl {
  private widgets: Map<WidgetType, RegisteredWidget> = new Map();
  private listeners: Set<RegistryListener> = new Set();

  register<
    TConfig extends BaseWidgetConfig = BaseWidgetConfig,
    TProps extends BaseWidgetProps<TConfig> = BaseWidgetProps<TConfig>,
  >(definition: WidgetDefinition<TConfig, TProps>): void {
    const registered: RegisteredWidget = {
      type: definition.type,
      displayName: definition.displayName,
      description: definition.description,
      component: definition.component,
      icon: definition.icon,
      defaultConfig: definition.defaultConfig,
      validateConfig: definition.validateConfig as
        | ((config: BaseWidgetConfig) => string[] | null)
        | undefined,
    };
    this.widgets.set(definition.type, registered);
    this.notifyListeners();

    // Widget registration is silent in all environments
  }

  unregister(type: WidgetType): boolean {
    const result = this.widgets.delete(type);
    if (result) {
      this.notifyListeners();
    }
    return result;
  }

  get(type: WidgetType): RegisteredWidget | undefined {
    return this.widgets.get(type);
  }

  has(type: WidgetType): boolean {
    return this.widgets.has(type);
  }

  getAll(): RegisteredWidget[] {
    return Array.from(this.widgets.values());
  }

  getTypes(): WidgetType[] {
    return Array.from(this.widgets.keys());
  }

  validateConfig<TConfig extends BaseWidgetConfig>(
    type: WidgetType,
    config: TConfig,
  ): string[] | null {
    const widget = this.widgets.get(type);
    if (!widget) {
      return [`Widget type "${type}" is not registered`];
    }
    if (widget.validateConfig) {
      return widget.validateConfig(config);
    }
    return null;
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot = (): RegisteredWidget[] => {
    return this.getAll();
  };

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const WidgetRegistry = new WidgetRegistryImpl();

export function useWidgetRegistry(): RegisteredWidget[] {
  return useSyncExternalStore(
    WidgetRegistry.subscribe.bind(WidgetRegistry),
    WidgetRegistry.getSnapshot,
    WidgetRegistry.getSnapshot,
  );
}

export function createWidgetData<TConfig extends BaseWidgetConfig>(
  type: WidgetType,
  config: TConfig,
  options?: {
    id?: string;
    interactive?: boolean;
    initialValues?: Record<string, unknown>;
  },
): WidgetData<TConfig> {
  return {
    id: options?.id ?? `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    config,
    interactive: options?.interactive ?? true,
    state: options?.initialValues ? { initialValues: options.initialValues } : undefined,
    createdAt: new Date().toISOString(),
  };
}
