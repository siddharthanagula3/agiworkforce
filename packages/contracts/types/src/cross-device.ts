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
  id: string;

  userId: string;

  title: string;

  deviceIds: string[];

  status: 'active' | 'paused' | 'completed' | 'archived' | 'deleted';

  lastMessageAt: string;

  createdAt: string;
}

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
  id: string;

  threadId: string;

  deviceId: string;

  deviceType: 'desktop' | 'mobile' | 'web';

  role: 'user' | 'assistant' | 'system';

  content: string;

  attachments?: CrossDeviceAttachment[];

  timestamp: string;
}

export interface CrossDeviceAttachment {
  id: string;

  type: 'file' | 'screenshot' | 'artifact';

  name: string;

  mimeType: string;

  size: number;

  url?: string;

  data?: string;
}

export interface DispatchTaskCreateRequest {
  action: 'dispatch.task.create';
  version: 1;
  requestId: string;
  prompt: string;
  title?: string;
  sentAt: string;
}

export interface DispatchTaskCancelRequest {
  action: 'dispatch.task.cancel';
  version: 1;
  requestId: string;
  taskId?: string;
  sentAt: string;
}

export type DispatchTaskControlRequest = DispatchTaskCreateRequest | DispatchTaskCancelRequest;

export type DispatchTaskLifecycleStatus =
  | 'accepted'
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'ready_for_review'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface DispatchTaskStatusEvent {
  action: 'dispatch.task.status';
  version: 1;
  requestId: string;
  taskId?: string;
  status: DispatchTaskLifecycleStatus;
  message?: string;
  result?: string;
  error?: string;
  updatedAt: string;
}

export type CompanionApprovalRiskLevel = 'low' | 'medium' | 'high';

export type CompanionApprovalType =
  | 'file_delete'
  | 'command'
  | 'api_call'
  | 'data_modification'
  | 'other';

export interface CompanionApprovalRequestEvent {
  action: 'approval_request';
  version: 1;
  requestId: string;
  toolName: string;
  description: string;
  riskLevel: CompanionApprovalRiskLevel;
  type: CompanionApprovalType;
  createdAt: string;
  expiresAt?: string;
  countdown?: number;
}

export interface CompanionApprovalResponse {
  action: 'approval_response';
  version: 1;
  requestId: string;
  approved: boolean;
  respondedAt: string;
  reason?: string;
}

export interface CompanionApprovalClosedEvent {
  action: 'approval_closed';
  version: 1;
  requestId: string;
  closedAt: string;
}

export type ControlReceiptOutcome = 'accepted' | 'duplicate' | 'rejected';

/**
 * Desktop acknowledgement that a mobile control request arrived and was
 * dispatched. Mobile keeps a control pending until this receipt lands, so a
 * dropped data-channel frame is retried with the same `requestId` instead of
 * being silently lost. Desktop replies to a replayed `requestId` with the
 * stored receipt and `outcome: 'duplicate'` rather than acting twice.
 */
export interface ControlReceiptEvent {
  action: 'control.receipt';
  version: 1;
  requestId: string;
  controlAction: string;
  outcome: ControlReceiptOutcome;
  reason?: string;
  receivedAt: string;
}

export interface CompanionApprovalSnapshotEvent {
  action: 'approval_snapshot';
  version: 1;
  pendingRequestIds: string[];
  syncedAt: string;
}

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
  id: string;

  userId: string;

  desktopDeviceId: string;

  mobileDeviceId: string;

  status: 'pending' | 'active' | 'expired' | 'revoked';

  pairingCode: string;

  createdAt: string;

  expiresAt: string;
}

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
  type: 'progress' | 'tool_call' | 'tool_result' | 'screenshot' | 'completed' | 'failed';

  taskId: string;

  timestamp: string;

  data: Record<string, unknown>;
}
