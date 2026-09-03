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

export interface ExecutionStreamEvent {
  type: 'progress' | 'tool_call' | 'tool_result' | 'screenshot' | 'completed' | 'failed';

  taskId: string;

  timestamp: string;

  data: Record<string, unknown>;
}
