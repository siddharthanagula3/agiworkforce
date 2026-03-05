/**
 * Tauri Types
 *
 * Type definitions for Tauri command parameters, return types, and event payloads.
 * These types ensure type safety when communicating between the frontend and Rust backend.
 *
 * @module tauri
 * @packageDocumentation
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Generic payload wrapper for Tauri events.
 */
export interface TauriEventPayload<T = unknown> {
  payload: T;
}

/**
 * Event listener function type with typed payload.
 */
export type TauriEventListener<T = unknown> = (event: TauriEventPayload<T>) => void;

/**
 * Function to unsubscribe from an event.
 */
export type TauriUnlisten = () => void;

// ============================================================================
// Browser Automation Types
// ============================================================================

/**
 * Browser action event payload.
 */
export interface BrowserActionPayload {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'scroll' | 'wait' | 'execute';
  timestamp: number;
  duration?: number;
  success: boolean;
  details: {
    url?: string;
    selector?: string;
    text?: string;
    script?: string;
    result?: unknown;
    error?: string;
  };
  screenshotId?: string;
}

/**
 * Console log event payload from browser automation.
 */
export interface BrowserConsolePayload {
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

/**
 * Network request event payload from browser automation.
 */
export interface BrowserNetworkPayload {
  url: string;
  method: string;
  status: number;
  duration_ms: number;
  timestamp: number;
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * SQL query result from Tauri backend.
 */
export interface SqlQueryResult {
  columns?: string[];
  rows?: SqlRowValue[][];
  affected_rows?: number;
  execution_time_ms?: number;
}

/**
 * Allowed SQL row value types.
 */
export type SqlRowValue = string | number | boolean | null;

/**
 * MongoDB document type.
 */
export type MongoDocument = Record<string, unknown>;

/**
 * MongoDB query filter.
 */
export type MongoFilter = Record<string, unknown>;

/**
 * MongoDB update operations.
 */
export type MongoUpdate = Record<string, unknown>;

/**
 * MongoDB operation result.
 */
export interface MongoResult {
  matched_count?: number;
  modified_count?: number;
  upserted_id?: string;
}

// ============================================================================
// Performance Entry Types
// ============================================================================

/**
 * Extended performance entry for first input delay.
 */
export interface PerformanceEventTimingEntry extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  duration: number;
  cancelable: boolean;
  target?: EventTarget | null;
}

/**
 * Extended performance entry for layout shift.
 */
export interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  lastInputTime: number;
  sources: LayoutShiftAttribution[];
}

/**
 * Layout shift attribution details.
 */
export interface LayoutShiftAttribution {
  node?: Node;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Timeseries data point for cost analytics.
 */
export interface TimeseriesDataPoint {
  date: string;
  total_cost: number;
  request_count?: number;
  token_count?: number;
}

/**
 * Provider usage data for analytics.
 */
export interface ProviderUsageData {
  provider: string;
  total_cost: number;
  request_count?: number;
  percentage?: number;
}

/**
 * Conversation usage data for analytics.
 */
export interface ConversationUsageData {
  conversation_id: string;
  title?: string;
  total_cost: number;
  message_count?: number;
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Generic workflow node data.
 * For type-safe usage, prefer specific node data types.
 */
export interface WorkflowNodeData {
  label: string;
  [key: string]: unknown;
}

/**
 * Generic workflow execution data.
 */
export interface WorkflowExecutionData {
  [key: string]: unknown;
}

/**
 * Workflow log event data.
 */
export interface WorkflowLogData {
  message?: string;
  error?: string;
  output?: unknown;
  duration_ms?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Default value type for configuration fields.
 * Supports primitives, arrays, and objects.
 */
export type ConfigDefaultValue =
  | string
  | number
  | boolean
  | null
  | ConfigDefaultValue[]
  | { [key: string]: ConfigDefaultValue };

/**
 * MCP server configuration.
 */
export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  enabled?: boolean;
}

// ============================================================================
// Error Types (re-exported from errors.ts for backwards compatibility)
// ============================================================================

// Note: Error types are now defined in errors.ts and re-exported from index.ts.
// New code should import from '@agiworkforce/types' directly.
export type { CodedError } from './errors';
export { isCodedError } from './errors';

// ============================================================================
// React Flow Types
// ============================================================================

/**
 * React Flow node with typed data.
 */
export interface TypedReactFlowNode<T = WorkflowNodeData> {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: T;
  selected?: boolean;
  dragging?: boolean;
}

/**
 * React Flow edge type.
 */
export interface TypedReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
}

// ============================================================================
// Message Metadata Types
// ============================================================================

/**
 * Extended metadata for chat messages.
 */
export interface ExtendedMessageMetadata {
  thinkingSummary?: string;
  summary?: string;
  duration?: number;
  steps?: number;
  artifacts?: unknown[];
  [key: string]: unknown;
}

// ============================================================================
// Subscription Types
// ============================================================================

/**
 * Valid subscription status values.
 */
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'trialing';

/**
 * Valid plan tier values.
 */
export type PlanTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise' | 'none';

// ============================================================================
// DOMPurify Config Types
// ============================================================================

/**
 * DOMPurify configuration options.
 */
export interface DOMPurifyConfig {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOWED_URI_REGEXP?: RegExp;
  ALLOW_DATA_ATTR?: boolean;
  ALLOW_UNKNOWN_PROTOCOLS?: boolean;
  SAFE_FOR_TEMPLATES?: boolean;
}
