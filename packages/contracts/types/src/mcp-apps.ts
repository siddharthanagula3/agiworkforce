/**
 * MCP App Types
 *
 * Types for MCP Apps — interactive tool UIs rendered inside the chat
 * surface. MCP Apps allow tool servers to return rich, interactive
 * content (charts, tables, forms, dashboards) instead of plain text.
 *
 * The desktop and web surfaces host MCP App panels in sandboxed iframes.
 * Communication between the host and the iframe uses a structured
 * `McpAppMessage` protocol over `postMessage`.
 *
 * @module mcp-apps
 * @packageDocumentation
 */

// ============================================================================
// UI Component
// ============================================================================

/**
 * A single UI element within an MCP App layout.
 *
 * Each component has a stable `id`, a `type` discriminant, and a
 * free-form `props` bag that the rendering engine interprets. Optional
 * `events` wire DOM interactions back to the tool server via JSON-RPC.
 *
 * @example
 * ```typescript
 * const btn: McpUIComponent = {
 *   id: 'submit-btn',
 *   type: 'button',
 *   props: { label: 'Run Report', variant: 'primary' },
 *   events: [{ name: 'click', handler: 'reports/run' }],
 * };
 * ```
 */
export interface McpUIComponent {
  /** Stable component identifier within the app layout. */
  id: string;

  /** Visual / functional component type. */
  type: 'chart' | 'table' | 'input' | 'button' | 'text' | 'image' | 'code' | 'select';

  /** Component-specific render properties. Shape is component-type-dependent. */
  props: Record<string, unknown>;

  /** DOM events that invoke JSON-RPC methods on the tool server. */
  events?: McpUIEvent[];
}

// ============================================================================
// UI Event
// ============================================================================

/**
 * A mapping from a DOM event name to a JSON-RPC handler method.
 *
 * When the named event fires on the component, the MCP App runtime
 * calls the specified JSON-RPC method on the tool server, forwarding
 * the event payload as params.
 */
export interface McpUIEvent {
  /** DOM event name (e.g., `"click"`, `"change"`, `"submit"`). */
  name: string;

  /** JSON-RPC method name to invoke on the tool server. */
  handler: string;
}

// ============================================================================
// UI Schema
// ============================================================================

/**
 * Declarative layout and component tree for an MCP App.
 *
 * @example
 * ```typescript
 * const schema: McpAppUISchema = {
 *   type: 'dashboard',
 *   layout: 'grid',
 *   width: 800,
 *   height: 600,
 *   components: [
 *     { id: 'revenue-chart', type: 'chart', props: { chartType: 'line' } },
 *     { id: 'data-table',    type: 'table', props: { columns: ['date', 'amount'] } },
 *   ],
 * };
 * ```
 */
export interface McpAppUISchema {
  /** Top-level container style. */
  type: 'chart' | 'table' | 'form' | 'dashboard' | 'markdown' | 'custom';

  /** Ordered list of components rendered inside the container. */
  components: McpUIComponent[];

  /** Layout direction for the component list. Defaults to `'vertical'`. */
  layout?: 'vertical' | 'horizontal' | 'grid';

  /** Preferred width in logical pixels. Host may override. */
  width?: number;

  /** Preferred height in logical pixels. Host may override. */
  height?: number;
}

// ============================================================================
// App Permissions
// ============================================================================

/**
 * Capability grants for a sandboxed MCP App iframe.
 *
 * Permissions are enforced by the host at the `<iframe>` level (CSP,
 * `sandbox` attribute). Tool servers declare required permissions in
 * their app definition; the platform prompts the user for approval.
 */
export interface McpAppPermissions {
  /** Allow outbound network requests from inside the app. */
  allowNetwork: boolean;

  /** Allow local storage access inside the app sandbox. */
  allowStorage: boolean;

  /** Allow read/write access to the system clipboard. */
  allowClipboard: boolean;

  /**
   * Maximum frame height the app may request via a `resize` message.
   * Omit to use the host default.
   */
  maxHeight?: number;
}

// ============================================================================
// App Definition
// ============================================================================

/**
 * Complete definition of a registered MCP App.
 *
 * An MCP App is registered by its tool server and surfaced in the chat
 * when the server's tool returns a response with `type: 'mcp_app'`.
 *
 * @example
 * ```typescript
 * const app: McpAppDefinition = {
 *   id: 'analytics-dashboard',
 *   name: 'Analytics Dashboard',
 *   description: 'Interactive revenue and usage charts',
 *   uiSchema: { type: 'dashboard', components: [], layout: 'grid' },
 *   permissions: { allowNetwork: false, allowStorage: false, allowClipboard: false },
 * };
 * ```
 */
export interface McpAppDefinition {
  /** Unique app identifier (scoped to the tool server). */
  id: string;

  /** Human-readable app name shown in the chat surface header. */
  name: string;

  /** Short description displayed in tool browsers and permission prompts. */
  description: string;

  /** Declarative UI layout rendered by the host. */
  uiSchema: McpAppUISchema;

  /** Capability grants required by this app. */
  permissions: McpAppPermissions;
}

// ============================================================================
// App Message (iframe ↔ host protocol)
// ============================================================================

/**
 * A message exchanged between a sandboxed MCP App iframe and its host.
 *
 * All messages are sent via `window.postMessage` with the structured
 * payload below. The `id` field correlates requests to responses.
 *
 * Message flow:
 * - `rpc-request`  -- iframe → host: invoke a JSON-RPC method.
 * - `rpc-response` -- host → iframe: result or error for a prior request.
 * - `event`        -- host → iframe: platform-initiated event (e.g., theme change).
 * - `resize`       -- iframe → host: request a frame height change.
 *
 * @example
 * ```typescript
 * // iframe requests a report
 * const req: McpAppMessage = {
 *   type: 'rpc-request',
 *   id: 'req-1',
 *   method: 'reports/run',
 *   params: { reportId: 'monthly-revenue' },
 * };
 *
 * // host returns the result
 * const res: McpAppMessage = {
 *   type: 'rpc-response',
 *   id: 'req-1',
 *   result: { rows: [] },
 * };
 * ```
 */
export interface McpAppMessage {
  /** Message type discriminant. */
  type: 'rpc-request' | 'rpc-response' | 'event' | 'resize';

  /** Correlation identifier — must be unique per request/response pair. */
  id: string;

  /** JSON-RPC method name (present on `rpc-request` messages). */
  method?: string;

  /** JSON-RPC request parameters (present on `rpc-request` messages). */
  params?: unknown;

  /** Successful JSON-RPC result (present on `rpc-response` messages). */
  result?: unknown;

  /** JSON-RPC error object (present on `rpc-response` messages when the call failed). */
  error?: {
    /** Standard JSON-RPC error code. */
    code: number;
    /** Human-readable error description. */
    message: string;
  };
}
