/**
 * Tool Event Types
 *
 * TypeScript counterparts to the Rust `ToolEvent` enum defined in
 * `apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs`.
 *
 * The Rust enum is serialised with `#[serde(tag = "type", rename_all = "snake_case")]`,
 * which means:
 *   - The discriminant field is `"type"`.
 *   - Variant names are serialised as snake_case strings
 *     (`"started"`, `"progress"`, `"completed"`).
 *   - `Option<T>` fields serialised as `null` or absent when `None`.
 *
 * Tauri emits these events on the `"tool:event"` channel using `emit_tool_event()`.
 *
 * ### Rust-to-TypeScript field type mappings used here
 * | Rust        | TypeScript  |
 * |-------------|-------------|
 * | `String`    | `string`    |
 * | `i64`       | `number`    |
 * | `usize`     | `number`    |
 * | `u64`       | `number`    |
 * | `bool`      | `boolean`   |
 * | `f32`       | `number`    |
 * | `Option<T>` | `T?`        |
 *
 * @module tool-events
 * @packageDocumentation
 */

// ============================================================================
// ToolEvent — Discriminated Union
// ============================================================================

/**
 * Emitted when a tool call begins executing.
 *
 * Rust variant: `ToolEvent::Started`
 *
 * @example
 * ```typescript
 * const event: ToolEventStarted = {
 *   type: 'started',
 *   id: 'tool-abc-123',
 *   conversation_id: 42,
 *   message_id: 'msg-xyz',
 *   tool_name: 'mcp__filesystem__read_file',
 *   display_name: 'Read',
 *   display_args: 'src/main.rs',
 *   iteration: 1
 * };
 * ```
 */
export interface ToolEventStarted {
  /** Discriminant — always `"started"` for this variant. */
  type: 'started';

  /** Unique identifier for this tool call instance. */
  id: string;

  /**
   * Database row ID of the parent conversation.
   * Maps from Rust `i64`.
   */
  conversation_id: number;

  /** ID of the assistant message that triggered this tool call. */
  message_id: string;

  /**
   * Raw MCP tool name (e.g., `"mcp__filesystem__read_file"`).
   * Use `display_name` for human-readable UI labels.
   */
  tool_name: string;

  /**
   * Short human-readable label produced by `get_tool_display_info()`.
   * Examples: `"Read"`, `"Bash"`, `"WebSearch"`.
   */
  display_name: string;

  /**
   * Truncated argument string produced by `get_tool_display_info()`.
   * Examples: `"src/main.rs"`, `"cargo test"`, `"react hooks"`.
   */
  display_args: string;

  /**
   * 1-based agentic loop iteration in which this tool call occurred.
   * Maps from Rust `usize`.
   */
  iteration: number;
}

/**
 * Emitted while a tool call is executing to report incremental progress.
 *
 * Rust variant: `ToolEvent::Progress`
 *
 * Both `stdout_chunk` and `progress_pct` are optional; any combination may
 * appear in a single event.
 *
 * @example
 * ```typescript
 * const event: ToolEventProgress = {
 *   type: 'progress',
 *   id: 'tool-abc-123',
 *   conversation_id: 42,
 *   message_id: 'msg-xyz',
 *   stdout_chunk: 'Building... 3/10 packages',
 *   progress_pct: 30
 * };
 * ```
 */
export interface ToolEventProgress {
  /** Discriminant — always `"progress"` for this variant. */
  type: 'progress';

  /** Unique identifier matching the preceding `ToolEventStarted.id`. */
  id: string;

  /**
   * Database row ID of the parent conversation.
   * Maps from Rust `i64`.
   */
  conversation_id: number;

  /** ID of the assistant message that triggered this tool call. */
  message_id: string;

  /**
   * Incremental stdout text chunk from the tool execution.
   * Maps from Rust `Option<String>` — absent when `None`.
   */
  stdout_chunk?: string;

  /**
   * Completion percentage (0–100).
   * Maps from Rust `Option<f32>` — absent when `None`.
   */
  progress_pct?: number;
}

/**
 * Emitted when a tool call finishes, whether successfully or with an error.
 *
 * Rust variant: `ToolEvent::Completed`
 *
 * @example Successful completion:
 * ```typescript
 * const event: ToolEventCompleted = {
 *   type: 'completed',
 *   id: 'tool-abc-123',
 *   conversation_id: 42,
 *   message_id: 'msg-xyz',
 *   success: true,
 *   duration_ms: 312,
 *   result_preview: '// src/main.rs\nfn main() { ... }'
 * };
 * ```
 *
 * @example Failed completion:
 * ```typescript
 * const event: ToolEventCompleted = {
 *   type: 'completed',
 *   id: 'tool-abc-123',
 *   conversation_id: 42,
 *   message_id: 'msg-xyz',
 *   success: false,
 *   duration_ms: 45,
 *   error: 'Permission denied: /etc/shadow'
 * };
 * ```
 */
export interface ToolEventCompleted {
  /** Discriminant — always `"completed"` for this variant. */
  type: 'completed';

  /** Unique identifier matching the preceding `ToolEventStarted.id`. */
  id: string;

  /**
   * Database row ID of the parent conversation.
   * Maps from Rust `i64`.
   */
  conversation_id: number;

  /** ID of the assistant message that triggered this tool call. */
  message_id: string;

  /** Whether the tool call succeeded without an error. */
  success: boolean;

  /**
   * Wall-clock time the tool took to run, in milliseconds.
   * Maps from Rust `u64`.
   */
  duration_ms: number;

  /**
   * Short preview of the tool output (first N characters of the result).
   * Maps from Rust `Option<String>` — absent when `None`.
   */
  result_preview?: string;

  /**
   * Error message when `success` is `false`.
   * Maps from Rust `Option<String>` — absent when `None`.
   */
  error?: string;
}

/**
 * Discriminated union of all tool event variants.
 *
 * Use the `type` field to narrow to a specific variant:
 *
 * ```typescript
 * function handleToolEvent(event: ToolEvent) {
 *   switch (event.type) {
 *     case 'started':
 *       // TypeScript knows: event is ToolEventStarted
 *       console.log('Tool started:', event.display_name, event.display_args);
 *       break;
 *     case 'progress':
 *       // TypeScript knows: event is ToolEventProgress
 *       if (event.stdout_chunk) console.log(event.stdout_chunk);
 *       break;
 *     case 'completed':
 *       // TypeScript knows: event is ToolEventCompleted
 *       console.log('Finished in', event.duration_ms, 'ms, success:', event.success);
 *       break;
 *   }
 * }
 * ```
 *
 * Tauri emits these on channel `"tool:event"`. Example listener setup:
 * ```typescript
 * import { listen } from '@tauri-apps/api/event';
 * import type { ToolEvent } from '@agiworkforce/types';
 *
 * const unlisten = await listen<ToolEvent>('tool:event', ({ payload }) => {
 *   handleToolEvent(payload);
 * });
 * ```
 */
export type ToolEvent = ToolEventStarted | ToolEventProgress | ToolEventCompleted;

// ============================================================================
// Agentic Loop Status
// ============================================================================

/**
 * Snapshot of the agentic loop's current execution state.
 *
 * Consumed by the frontend to show/hide loop indicators and enforce
 * the iteration cap in the UI layer.
 *
 * @example
 * ```typescript
 * const status: AgenticLoopStatus = {
 *   active: true,
 *   conversationId: 42,
 *   iteration: 3,
 *   maxIterations: 10
 * };
 * ```
 */
export interface AgenticLoopStatus {
  /** Whether the agentic loop is currently running. */
  active: boolean;

  /**
   * The conversation that owns the active loop.
   * `null` when `active` is `false`.
   */
  conversationId: number | null;

  /** Current 1-based iteration count. */
  iteration: number;

  /** Maximum iterations allowed before the loop is force-stopped. */
  maxIterations: number;
}

// ============================================================================
// Tool Label Entry (UI state)
// ============================================================================

/**
 * UI-layer record tracking the display state of a single tool call.
 *
 * Derived from `ToolEvent` emissions and stored in frontend state (e.g., a
 * Zustand store). One entry per `id` is created on `started` and mutated on
 * `progress` / `completed`.
 *
 * @example Initial entry (on `started`):
 * ```typescript
 * const entry: ToolLabelEntry = {
 *   id: 'tool-abc-123',
 *   displayName: 'Read',
 *   displayArgs: 'src/main.rs',
 *   status: 'running'
 * };
 * ```
 *
 * @example After completion:
 * ```typescript
 * const entry: ToolLabelEntry = {
 *   id: 'tool-abc-123',
 *   displayName: 'Read',
 *   displayArgs: 'src/main.rs',
 *   status: 'completed',
 *   durationMs: 312
 * };
 * ```
 */
export interface ToolLabelEntry {
  /** Unique tool call identifier — matches `ToolEvent.id`. */
  id: string;

  /**
   * Short human-readable label (e.g., `"Read"`, `"Bash"`).
   * Sourced from `ToolEventStarted.display_name`.
   */
  displayName: string;

  /**
   * Truncated argument string (e.g., `"src/main.rs"`, `"cargo test"`).
   * Sourced from `ToolEventStarted.display_args`.
   */
  displayArgs: string;

  /**
   * Current execution status of the tool call.
   * - `"running"` — tool is executing (set on `started`)
   * - `"completed"` — tool finished successfully (set on `completed` with `success: true`)
   * - `"error"` — tool finished with an error (set on `completed` with `success: false`)
   */
  status: 'running' | 'completed' | 'error';

  /**
   * Wall-clock duration in milliseconds.
   * Present only after a `ToolEventCompleted` has been received.
   */
  durationMs?: number;

  /**
   * Error message when `status` is `"error"`.
   * Sourced from `ToolEventCompleted.error`.
   */
  error?: string;

  /**
   * Optional parallel group identifier.
   *
   * When the Rust agentic loop emits multiple `ToolEvent::Started` events for
   * tool calls that are dispatched concurrently (e.g., reading several files at
   * once), it may set this field to the same non-empty string on all of them.
   * The `ToolTimeline` component uses this to render those entries inside a
   * shared visual group, mirroring the Claude Code "parallel reads" treatment.
   *
   * `undefined` (absent) means the tool was dispatched independently.
   */
  parallelGroup?: string;
}
