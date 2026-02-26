/**
 * WidgetRegistry
 *
 * Central registry for chat widgets. Allows registering, retrieving,
 * and managing widget types and their rendering components.
 *
 * @module Widgets/WidgetRegistry
 */

import React, { useSyncExternalStore } from 'react';
import { LucideIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/**
 * Widget type identifier - string key for registered widgets.
 */
export type WidgetType = string;

/**
 * Base widget configuration interface.
 * Extended by specific widget configs.
 */
export interface BaseWidgetConfig {
  [key: string]: unknown;
}

/**
 * Base widget props interface.
 * All widget components receive these props.
 */
export interface BaseWidgetProps<TConfig = BaseWidgetConfig> {
  /** Widget configuration data */
  config: TConfig;
  /** Called when widget is submitted */
  onSubmit?: (data: unknown) => void;
  /** Called when widget is cancelled */
  onCancel?: () => void;
  /** Whether widget is read-only */
  readOnly?: boolean;
  /** Previously submitted values (for re-rendering) */
  submittedValues?: Record<string, unknown>;
  /** Initial values for the widget */
  initialValues?: Record<string, unknown>;
  /** Widget instance ID */
  widgetId: string;
  /** Parent message ID */
  messageId?: string;
}

/**
 * Widget definition for registration.
 */
export interface WidgetDefinition<
  TConfig extends BaseWidgetConfig = BaseWidgetConfig,
  TProps extends BaseWidgetProps<TConfig> = BaseWidgetProps<TConfig>,
> {
  /** Unique widget type identifier */
  type: WidgetType;
  /** Human-readable display name */
  displayName: string;
  /** Widget description */
  description?: string;
  /** React component that renders the widget */
  component: React.ComponentType<TProps>;
  /** Optional icon component */
  icon?: LucideIcon;
  /** Default configuration values */
  defaultConfig?: Partial<TConfig>;
  /** Validate widget configuration */
  validateConfig?: (config: TConfig) => string[] | null;
}

/**
 * Generic widget component props that WidgetRenderer passes at runtime.
 * AUDIT-P3-TYPE: This interface matches what WidgetRenderer actually passes to components.
 */
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
  // AUDIT-P3-TYPE: Using 'any' because widgets can be registered with either
  // BaseWidgetProps (new API) or WidgetRendererProps (legacy API)
  component: React.ComponentType<any>;
  icon?: LucideIcon;
  defaultConfig?: Partial<TConfig>;
  validateConfig?: (config: TConfig) => string[] | null;
}

/**
 * Widget data structure - what gets stored in messages.
 */
export interface WidgetData<TConfig extends BaseWidgetConfig = BaseWidgetConfig> {
  /** Unique widget instance ID */
  id: string;
  /** Widget type identifier */
  type: WidgetType;
  /** Widget configuration */
  config: TConfig;
  /** Whether the widget accepts user interaction */
  interactive?: boolean;
  /** Widget state (for submitted data, etc.) */
  state?: {
    data?: unknown;
    initialValues?: Record<string, unknown>;
    submitted?: boolean;
  };
  /** Creation timestamp */
  createdAt?: string;
}

// ============================================================================
// Registry Implementation
// ============================================================================

type RegistryListener = () => void;

class WidgetRegistryImpl {
  private widgets: Map<WidgetType, RegisteredWidget> = new Map();
  private listeners: Set<RegistryListener> = new Set();

  /**
   * Register a widget type.
   */
  register<
    TConfig extends BaseWidgetConfig = BaseWidgetConfig,
    TProps extends BaseWidgetProps<TConfig> = BaseWidgetProps<TConfig>,
  >(definition: WidgetDefinition<TConfig, TProps>): void {
    if (this.widgets.has(definition.type)) {
      console.warn(
        `[WidgetRegistry] Widget type "${definition.type}" is already registered. Overwriting.`,
      );
    }

    // AUDIT-P3-TYPE: Convert WidgetDefinition to RegisteredWidget.
    // RegisteredWidget.component uses 'any' to support multiple prop interfaces.
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

    if (process.env.DEV) {
      console.log(`[WidgetRegistry] Registered widget: ${definition.type}`);
    }
  }

  /**
   * Unregister a widget type.
   */
  unregister(type: WidgetType): boolean {
    const result = this.widgets.delete(type);
    if (result) {
      this.notifyListeners();
    }
    return result;
  }

  /**
   * Get a registered widget by type.
   */
  get(type: WidgetType): RegisteredWidget | undefined {
    return this.widgets.get(type);
  }

  /**
   * Check if a widget type is registered.
   */
  has(type: WidgetType): boolean {
    return this.widgets.has(type);
  }

  /**
   * Get all registered widgets.
   */
  getAll(): RegisteredWidget[] {
    return Array.from(this.widgets.values());
  }

  /**
   * Get all registered widget types.
   */
  getTypes(): WidgetType[] {
    return Array.from(this.widgets.keys());
  }

  /**
   * Validate widget configuration.
   */
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

  /**
   * Subscribe to registry changes.
   */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get snapshot for useSyncExternalStore.
   */
  getSnapshot = (): RegisteredWidget[] => {
    return this.getAll();
  };

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Global widget registry singleton.
 */
export const WidgetRegistry = new WidgetRegistryImpl();

/**
 * React hook to subscribe to registry changes.
 */
export function useWidgetRegistry(): RegisteredWidget[] {
  return useSyncExternalStore(
    WidgetRegistry.subscribe.bind(WidgetRegistry),
    WidgetRegistry.getSnapshot,
    WidgetRegistry.getSnapshot,
  );
}

/**
 * Helper function to create widget data.
 */
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
