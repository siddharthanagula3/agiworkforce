/**
 * Cross-Device Orchestration Types
 *
 * Types for persistent cross-device conversation threads and real-time
 * execution streaming between surfaces. Enables a user to start a task
 * on desktop and monitor it live from mobile, or vice versa.
 *
 * Core concepts:
 * - `CrossDeviceThread`, a conversation that spans multiple devices.
 * - `CrossDeviceMessage`, a single message within a thread, tagged with device origin.
 * - `CrossDeviceAttachment`, a file, screenshot, or artifact attached to a message.
 * - `DevicePairing`, a QR-code-initiated link between desktop and mobile.
 * - `ExecutionStreamEvent`, a real-time update streamed from desktop to mobile.
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
import type { AgentTaskState } from './generated/protocol/AgentTaskState';
import type { LifecycleProjection, LifecycleStatus } from './lifecycle-status';

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

export const RUN_STATUS_LABELS: Readonly<Record<DispatchTaskLifecycleStatus, string>> =
  Object.freeze({
    accepted: 'Queued',
    queued: 'Queued',
    running: 'Running',
    awaiting_input: 'Waiting for input',
    ready_for_review: 'Ready for review',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
  });

export function runStatusLabel(status: DispatchTaskLifecycleStatus): string {
  return RUN_STATUS_LABELS[status];
}

/**
 * The same words for the engine's own lifecycle. `AgentTaskState` and
 * `DispatchTaskLifecycleStatus` overlap on seven states and must never drift
 * into two vocabularies, so the shared ones are read from the labels above and
 * only the two states dispatch has no word for are added here.
 */
export const AGENT_TASK_STATE_LABELS: Readonly<Record<AgentTaskState, string>> = Object.freeze({
  queued: RUN_STATUS_LABELS.queued,
  running: RUN_STATUS_LABELS.running,
  awaiting_input: RUN_STATUS_LABELS.awaiting_input,
  ready_for_review: RUN_STATUS_LABELS.ready_for_review,
  completed: RUN_STATUS_LABELS.completed,
  failed: RUN_STATUS_LABELS.failed,
  cancelled: RUN_STATUS_LABELS.cancelled,
  paused: 'Paused',
  archived: 'Archived',
  planning: 'Planning',
  awaiting_approval: 'Waiting for approval',
  resuming: 'Resuming',
  partial: 'Partially completed',
  timed_out: 'Timed out',
});

export function agentTaskStateLabel(state: AgentTaskState): string {
  return AGENT_TASK_STATE_LABELS[state];
}

/**
 * Mirrors `AgentTaskState::legacy_equivalent` in the Rust protocol: the state a
 * client built before the last five variants was shown for the same situation,
 * so it renders the run instead of rejecting the payload.
 */
export const LEGACY_AGENT_TASK_STATES: Readonly<Record<AgentTaskState, AgentTaskState>> =
  Object.freeze({
    queued: 'queued',
    running: 'running',
    awaiting_input: 'awaiting_input',
    ready_for_review: 'ready_for_review',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
    paused: 'paused',
    archived: 'archived',
    planning: 'running',
    awaiting_approval: 'awaiting_input',
    resuming: 'running',
    partial: 'failed',
    timed_out: 'failed',
  });

export function legacyAgentTaskState(state: AgentTaskState): AgentTaskState {
  return LEGACY_AGENT_TASK_STATES[state];
}

export function agentTaskStatesReadAs(state: AgentTaskState): AgentTaskState[] {
  return (Object.keys(LEGACY_AGENT_TASK_STATES) as AgentTaskState[]).filter(
    (candidate) => candidate === state || LEGACY_AGENT_TASK_STATES[candidate] === state,
  );
}

export const TERMINAL_AGENT_TASK_STATES: ReadonlySet<AgentTaskState> = new Set<AgentTaskState>([
  'ready_for_review',
  'completed',
  'partial',
  'failed',
  'timed_out',
  'cancelled',
  'archived',
]);

export const DISPATCH_STATUS_AGENT_TASK_STATES: Readonly<
  Record<DispatchTaskLifecycleStatus, AgentTaskState>
> = Object.freeze({
  accepted: 'queued',
  queued: 'queued',
  running: 'running',
  awaiting_input: 'awaiting_input',
  ready_for_review: 'ready_for_review',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  rejected: 'failed',
});

export const AGENT_TASK_STATE_DISPATCH_STATUSES: Readonly<
  Record<AgentTaskState, DispatchTaskLifecycleStatus>
> = Object.freeze({
  queued: 'queued',
  planning: 'running',
  running: 'running',
  resuming: 'running',
  awaiting_input: 'awaiting_input',
  awaiting_approval: 'awaiting_input',
  paused: 'awaiting_input',
  ready_for_review: 'ready_for_review',
  completed: 'completed',
  archived: 'completed',
  partial: 'failed',
  failed: 'failed',
  timed_out: 'failed',
  cancelled: 'cancelled',
});

export function dispatchStatusForAgentTaskState(
  state: AgentTaskState,
): DispatchTaskLifecycleStatus {
  return AGENT_TASK_STATE_DISPATCH_STATUSES[state];
}

export function agentTaskStateForDispatchStatus(
  status: DispatchTaskLifecycleStatus,
): AgentTaskState {
  return DISPATCH_STATUS_AGENT_TASK_STATES[status];
}

/**
 * `archived` and `ready_for_review` project onto `completed`: the work ended,
 * and what happens to the record afterwards is a resource lifecycle question.
 * `partial` is its own ending, not a failure: part of the work landed, and a
 * caller that is told `failed` will offer to redo work that is already done.
 */
export const LIFECYCLE_STATUS_BY_AGENT_TASK_STATE: LifecycleProjection<AgentTaskState> =
  Object.freeze({
    queued: 'queued',
    planning: 'running',
    running: 'running',
    resuming: 'running',
    awaiting_input: 'awaiting_input',
    awaiting_approval: 'awaiting_input',
    paused: 'awaiting_input',
    ready_for_review: 'completed',
    completed: 'completed',
    archived: 'completed',
    partial: 'completed_partial',
    failed: 'failed',
    timed_out: 'failed',
    cancelled: 'cancelled',
  });

export const LIFECYCLE_STATUS_BY_DISPATCH_STATUS: LifecycleProjection<DispatchTaskLifecycleStatus> =
  Object.freeze({
    accepted: 'pending',
    queued: 'queued',
    running: 'running',
    awaiting_input: 'awaiting_input',
    ready_for_review: 'completed',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
    rejected: 'failed',
  });

export function lifecycleStatusForAgentTaskState(state: AgentTaskState): LifecycleStatus {
  return LIFECYCLE_STATUS_BY_AGENT_TASK_STATE[state];
}

export function lifecycleStatusForDispatchStatus(
  status: DispatchTaskLifecycleStatus,
): LifecycleStatus {
  return LIFECYCLE_STATUS_BY_DISPATCH_STATUS[status];
}

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
  'file_delete' | 'command' | 'api_call' | 'data_modification' | 'other';

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
 * agent dashboard, showing tool calls, screenshots, and final results
 * without storing them permanently.
 *
 * Event type semantics:
 * - `progress`, textual status update (what the agent is doing).
 * - `tool_call`, agent is about to invoke a tool; `data` contains tool name and args.
 * - `tool_result`, tool execution finished; `data` contains the result summary.
 * - `screenshot`, desktop screenshot captured; `data.base64` contains the image.
 * - `completed`, task finished successfully; `data` contains the final output.
 * - `failed`, task failed; `data.error` contains the error message.
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
