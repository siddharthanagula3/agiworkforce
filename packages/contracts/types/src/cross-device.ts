/**
 * Cross-Device Orchestration Types
 *
 * Types for persistent cross-device conversation threads and real-time
 * execution streaming between surfaces. Enables a user to start a task
 * on desktop and monitor it live from mobile — or vice versa.
 *
 * Core concepts:
 * - `CrossDeviceThread`   — a conversation that spans multiple devices.
 * - `CrossDeviceMessage`  — a single message within a thread, tagged with device origin.
 * - `CrossDeviceAttachment` — a file, screenshot, or artifact attached to a message.
 * - `DevicePairing`       — a QR-code-initiated link between desktop and mobile.
 * - `ExecutionStreamEvent` — a real-time update streamed from desktop to mobile.
 *
 * The signaling server (`services/signaling-server`) relays
 * `ExecutionStreamEvent` frames over WebRTC data channels.
 *
 * @module cross-device
 * @packageDocumentation
 */

// ============================================================================
// Cross-Device Thread
// ============================================================================

/**
 * A persistent conversation thread that can be accessed from multiple devices.
 *
 * Unlike a single-surface chat session, a cross-device thread is stored in
 * the cloud and synchronised to all paired devices in real time. Messages
 * from any device appear in the shared thread.
 *
 * @example
 * ```typescript
 * const thread: CrossDeviceThread = {
 *   id: 'thread-abc-123',
 *   userId: 'usr-xyz',
 *   title: 'Q1 Budget Analysis',
 *   deviceIds: ['desktop-mac-pro', 'iphone-16-pro'],
 *   status: 'active',
 *   lastMessageAt: '2026-03-19T10:45:00Z',
 *   createdAt: '2026-03-19T09:00:00Z',
 * };
 * ```
 */
export interface CrossDeviceThread {
  /** Unique thread identifier. */
  id: string;

  /** User who owns this thread. */
  userId: string;

  /** Human-readable thread title (auto-generated or user-set). */
  title: string;

  /** Identifiers of all devices that have participated in this thread. */
  deviceIds: string[];

  /**
   * Thread lifecycle status:
   * - `active`    — thread is live and accepting new messages.
   * - `paused`    — execution paused by user, but thread is not archived.
   * - `completed` — all tasks within the thread have finished.
   * - `archived`  — thread moved to archive; stored but no longer shown by default.
   * - `deleted`   — soft-deleted; retained for audit purposes, hidden from all UIs.
   *
   * Note: `archived` and `deleted` are persisted in the database
   * (`CHECK (status IN ('active', 'archived', 'deleted'))`).
   * `paused` and `completed` are runtime-only states managed by the frontend
   * before a thread is archived or deleted.
   */
  status: 'active' | 'paused' | 'completed' | 'archived' | 'deleted';

  /** ISO 8601 timestamp of the most recent message. */
  lastMessageAt: string;

  /** ISO 8601 timestamp when the thread was created. */
  createdAt: string;
}

// ============================================================================
// Cross-Device Message
// ============================================================================

/**
 * A single message in a `CrossDeviceThread`, tagged with its originating device.
 *
 * @example
 * ```typescript
 * const message: CrossDeviceMessage = {
 *   id: 'msg-001',
 *   threadId: 'thread-abc-123',
 *   deviceId: 'desktop-mac-pro',
 *   deviceType: 'desktop',
 *   role: 'user',
 *   content: 'Analyse the attached CSV and summarise key trends.',
 *   attachments: [{ id: 'att-1', type: 'file', name: 'q1.csv', mimeType: 'text/csv', size: 4096 }],
 *   timestamp: '2026-03-19T09:01:00Z',
 * };
 * ```
 */
export interface CrossDeviceMessage {
  /** Unique message identifier. */
  id: string;

  /** Thread this message belongs to. */
  threadId: string;

  /** Device that produced this message. */
  deviceId: string;

  /** Surface category of the originating device. */
  deviceType: 'desktop' | 'mobile' | 'web';

  /** Message author role. */
  role: 'user' | 'assistant' | 'system';

  /** Text content of the message. */
  content: string;

  /** Optional attached files, screenshots, or artifacts. */
  attachments?: CrossDeviceAttachment[];

  /** ISO 8601 timestamp when the message was created. */
  timestamp: string;
}

// ============================================================================
// Cross-Device Attachment
// ============================================================================

/**
 * A file, screenshot, or artifact attached to a `CrossDeviceMessage`.
 *
 * Small items (under ~1 MB) may be inlined as base64 in the `data` field.
 * Larger items should be uploaded to cloud storage and referenced via `url`.
 */
export interface CrossDeviceAttachment {
  /** Unique attachment identifier. */
  id: string;

  /** Attachment category. */
  type: 'file' | 'screenshot' | 'artifact';

  /** Original file name or a generated label for screenshots/artifacts. */
  name: string;

  /** MIME type of the attachment (e.g., `"text/csv"`, `"image/png"`). */
  mimeType: string;

  /** File size in bytes. */
  size: number;

  /** URL to the uploaded attachment (for large items). */
  url?: string;

  /** Base64-encoded content for small items (e.g., inline screenshots). */
  data?: string;
}

// ============================================================================
// Device Pairing
// ============================================================================

/**
 * A pairing record linking a desktop device to a mobile device.
 *
 * Created when the user scans the desktop QR code from the mobile app.
 * The `pairingCode` is a short-lived secret exchanged during the handshake;
 * after pairing succeeds it is no longer needed.
 *
 * @example
 * ```typescript
 * const pairing: DevicePairing = {
 *   id: 'pair-001',
 *   userId: 'usr-xyz',
 *   desktopDeviceId: 'desktop-mac-pro',
 *   mobileDeviceId: 'iphone-16-pro',
 *   status: 'active',
 *   pairingCode: '847293',
 *   createdAt: '2026-03-19T09:00:00Z',
 *   expiresAt: '2026-03-19T09:05:00Z',
 * };
 * ```
 */
export interface DevicePairing {
  /** Unique pairing record identifier. */
  id: string;

  /** User who initiated the pairing. */
  userId: string;

  /** Device ID of the desktop participant. */
  desktopDeviceId: string;

  /** Device ID of the mobile participant. */
  mobileDeviceId: string;

  /**
   * Pairing lifecycle status:
   * - `pending`  — QR code displayed; mobile has not yet confirmed.
   * - `active`   — Pairing established; devices are communicating.
   * - `expired`  — Pairing code timed out before the mobile confirmed.
   * - `revoked`  — Pairing was explicitly revoked by the user or an admin.
   */
  status: 'pending' | 'active' | 'expired' | 'revoked';

  /** Short numeric or alphanumeric code shown in the QR payload. */
  pairingCode: string;

  /** ISO 8601 timestamp when the pairing was initiated. */
  createdAt: string;

  /** ISO 8601 timestamp when the pairing code expires (typically 5 minutes). */
  expiresAt: string;
}

// ============================================================================
// Execution Stream Event
// ============================================================================

/**
 * A real-time execution update streamed from the desktop agent to mobile.
 *
 * Events are sent over the WebRTC data channel established during device
 * pairing. The mobile companion uses these events to render the live
 * agent dashboard — showing tool calls, screenshots, and final results
 * without storing them permanently.
 *
 * Event type semantics:
 * - `progress`    — textual status update (what the agent is doing).
 * - `tool_call`   — agent is about to invoke a tool; `data` contains tool name and args.
 * - `tool_result` — tool execution finished; `data` contains the result summary.
 * - `screenshot`  — desktop screenshot captured; `data.base64` contains the image.
 * - `completed`   — task finished successfully; `data` contains the final output.
 * - `failed`      — task failed; `data.error` contains the error message.
 *
 * @example
 * ```typescript
 * const event: ExecutionStreamEvent = {
 *   type: 'tool_call',
 *   taskId: 'task-abc-456',
 *   timestamp: '2026-03-19T09:02:00Z',
 *   data: { toolName: 'bash', args: { command: 'git status' } },
 * };
 * ```
 */
export interface ExecutionStreamEvent {
  /** Event type discriminant. */
  type: 'progress' | 'tool_call' | 'tool_result' | 'screenshot' | 'completed' | 'failed';

  /** Identifier of the agent task that produced this event. */
  taskId: string;

  /** ISO 8601 timestamp when the event was emitted. */
  timestamp: string;

  /**
   * Event payload. Shape varies by `type`:
   * - `progress`    — `{ message: string }`
   * - `tool_call`   — `{ toolName: string; args: Record<string, unknown> }`
   * - `tool_result` — `{ toolName: string; result: string; durationMs: number }`
   * - `screenshot`  — `{ base64: string; width: number; height: number }`
   * - `completed`   — `{ output: string }`
   * - `failed`      — `{ error: string }`
   */
  data: Record<string, unknown>;
}
