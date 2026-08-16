/**
 * Shared Runtime Activity and Approval Contracts
 *
 * Platform-agnostic interfaces for tracking tool execution activity and
 * user approval requests across all surfaces.
 *
 * Desktop is the source of truth for runtime activity (tools execute there).
 * Other surfaces (web dashboard, mobile, VS Code) consume these shapes
 * via sync or real-time channels for monitoring and approval.
 *
 * @module runtime
 * @packageDocumentation
 */

export const CLOUD_WORK_MODES = ['chat', 'agiwork'] as const;

export type CloudWorkMode = (typeof CLOUD_WORK_MODES)[number];

export type RuntimeActivityType = 'tool_call' | 'agent_action' | 'system_event' | 'mcp_request';

export type RuntimeActivityStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RuntimeActivity {
  id: string;

  type: RuntimeActivityType;

  status: RuntimeActivityStatus;

  toolName?: string;

  displayName?: string;

  args?: Record<string, unknown>;

  result?: string;

  startedAt: string;

  completedAt?: string;

  durationMs?: number;

  error?: string;

  conversationId?: string;

  agentSessionId?: string;
}

export type RoutingTaskType =
  | 'coding'
  | 'reasoning'
  | 'general'
  | 'agentic'
  | 'multimodal'
  | 'research'
  | 'computer-use'
  | 'image_generation'
  | 'creative_writing'
  | 'long_context'
  | 'simple_chat';

export interface RoutingDecision {
  routedModelId: string;
  taskType: RoutingTaskType;
  reason: string;
  wasRouted: boolean;
  timestamp: number;
}

export type BrowserAgentStatus = 'idle' | 'planning' | 'executing' | 'done' | 'error';

export interface BrowserActivityState {
  currentPageUrl: string | null;
  currentPageTitle: string | null;
  lastAction: string | null;
  agentStatus: BrowserAgentStatus;
  hasError: boolean;
  lastError: string | null;
  lastTaskActionsPerformed: number;
  extensionConnected: boolean;
}

export interface BrowserActivityEventDetail {
  active: boolean;
  url: string;
  title?: string | null;
  status?: BrowserAgentStatus;
  lastAction?: string | null;
  extensionConnected?: boolean;
  hasError?: boolean;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface ApprovalRequest {
  id: string;

  toolName: string;

  displayName?: string;

  params: Record<string, unknown>;

  status: ApprovalStatus;

  riskTier?: 'low' | 'medium' | 'high' | 'critical';

  reason?: string;

  requestedAt: string;

  respondedAt?: string;

  respondedFrom?: string;

  conversationId?: string;
}
