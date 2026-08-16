/**
 * Tauri Types
 *
 * Type definitions for Tauri command parameters, return types, and event payloads.
 * These types ensure type safety when communicating between the frontend and Rust backend.
 *
 * @module tauri
 * @packageDocumentation
 */

export interface TauriEventPayload<T = unknown> {
  payload: T;
}

export type TauriEventListener<T = unknown> = (event: TauriEventPayload<T>) => void;

export type TauriUnlisten = () => void;

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

export interface BrowserConsolePayload {
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

export interface BrowserNetworkPayload {
  url: string;
  method: string;
  status: number;
  duration_ms: number;
  timestamp: number;
}

export interface SqlQueryResult {
  columns?: string[];
  rows?: SqlRowValue[][];
  affected_rows?: number;
  execution_time_ms?: number;
}

export type SqlRowValue = string | number | boolean | null;

export type MongoDocument = Record<string, unknown>;

export type MongoFilter = Record<string, unknown>;

export type MongoUpdate = Record<string, unknown>;

export interface MongoResult {
  matched_count?: number;
  modified_count?: number;
  upserted_id?: string;
}

export interface PerformanceEventTimingEntry extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  duration: number;
  cancelable: boolean;
  target?: EventTarget | null;
}

export interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  lastInputTime: number;
  sources: LayoutShiftAttribution[];
}

export interface LayoutShiftAttribution {
  node?: Node;
  previousRect: DOMRectReadOnly;
  currentRect: DOMRectReadOnly;
}

export interface TimeseriesDataPoint {
  date: string;
  total_cost: number;
  request_count?: number;
  token_count?: number;
}

export interface ProviderUsageData {
  provider: string;
  total_cost: number;
  request_count?: number;
  percentage?: number;
}

export interface ConversationUsageData {
  conversation_id: string;
  title?: string;
  total_cost: number;
  message_count?: number;
}

export interface WorkflowNodeData {
  label: string;
  [key: string]: unknown;
}

export interface WorkflowExecutionData {
  [key: string]: unknown;
}

export interface WorkflowLogData {
  message?: string;
  error?: string;
  output?: unknown;
  duration_ms?: number;
}

export type ConfigDefaultValue =
  | string
  | number
  | boolean
  | null
  | ConfigDefaultValue[]
  | { [key: string]: ConfigDefaultValue };

export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  enabled?: boolean;
}

// Error Types (re-exported from errors.ts for backwards compatibility)

// Note: Error types are now defined in errors.ts and re-exported from index.ts.
export type { CodedError } from './errors';
export { isCodedError } from './errors';

export interface TypedReactFlowNode<T = WorkflowNodeData> {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: T;
  selected?: boolean;
  dragging?: boolean;
}

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

export interface ExtendedMessageMetadata {
  thinkingSummary?: string;
  summary?: string;
  duration?: number;
  steps?: number;
  artifacts?: unknown[];
  [key: string]: unknown;
}

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'trialing';

export interface DOMPurifyConfig {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOWED_URI_REGEXP?: RegExp;
  ALLOW_DATA_ATTR?: boolean;
  ALLOW_UNKNOWN_PROTOCOLS?: boolean;
  SAFE_FOR_TEMPLATES?: boolean;
}
