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
  type: 'started';

  id: string;

  conversation_id: number;

  message_id: string;

  tool_name: string;

  display_name: string;

  display_args: string;

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
  type: 'progress';

  id: string;

  conversation_id: number;

  message_id: string;

  stdout_chunk?: string;

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
  type: 'completed';

  id: string;

  conversation_id: number;

  message_id: string;

  success: boolean;

  duration_ms: number;

  result_preview?: string;

  error?: string;
}

export type ToolEvent = ToolEventStarted | ToolEventProgress | ToolEventCompleted;

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
  active: boolean;

  conversationId: number | null;

  iteration: number;

  maxIterations: number;
}

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
  id: string;

  displayName: string;

  displayArgs: string;

  status: 'running' | 'completed' | 'error';

  durationMs?: number;

  error?: string;

  parallelGroup?: string;

  resultPreview?: string;

  checkpointId?: string;

  rawName?: string;
}
