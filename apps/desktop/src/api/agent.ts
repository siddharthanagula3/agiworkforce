/**
 * Agent API
 *
 * TypeScript wrappers for the autonomous agent Tauri commands.
 * Provides task submission, status tracking, plan management,
 * and trusted workflow configuration.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** Configuration for initializing the autonomous agent */
export interface AgentConfig {
  /** Maximum number of concurrent steps */
  maxConcurrentSteps?: number;
  /** Default timeout per step in seconds */
  defaultStepTimeoutSecs?: number;
  /** Whether to auto-approve tool executions */
  autoApprove?: boolean;
}

/** Request payload for submitting a task to the agent */
export interface AgentSubmitTaskRequest {
  description: string;
  autoApprove?: boolean;
}

/** Response after submitting a task */
export interface SubmitTaskResponse {
  taskId: string;
}

/** Task status response from the agent */
export interface TaskStatusResponse {
  task: AgentTask;
}

/** Represents a task managed by the autonomous agent */
export interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  result?: string;
  error?: string;
  steps?: AgentTaskStep[];
}

/** A step within an agent task */
export interface AgentTaskStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

/** Response from listing all tasks */
export interface ListTasksResponse {
  tasks: AgentTask[];
}

/** Map of workflow hashes to their trusted tool lists */
export type TrustedWorkflowMap = Record<string, string[]>;

// ============================================================================
// Agent Lifecycle
// ============================================================================

/**
 * Initialize the autonomous agent with configuration.
 * Must be called before submitting tasks.
 */
export async function agentInit(config?: AgentConfig): Promise<void> {
  if (!isTauri) {
    console.info('[agent] agentInit (mock)', config);
    return;
  }

  return invoke<void>('agent_init', {
    config: config ?? {},
  });
}

// ============================================================================
// Task Management
// ============================================================================

/**
 * Submit a new task to the autonomous agent for execution.
 */
export async function agentSubmitTask(
  description: string,
  autoApprove?: boolean,
): Promise<SubmitTaskResponse> {
  if (!isTauri) {
    console.info('[agent] agentSubmitTask (mock)', description);
    return { taskId: `mock_task_${Date.now()}` };
  }

  return invoke<SubmitTaskResponse>('agent_submit_task', {
    request: { description, autoApprove } satisfies AgentSubmitTaskRequest,
  });
}

/**
 * Get the current status of a task by ID.
 */
export async function agentGetTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  if (!isTauri) {
    console.info('[agent] agentGetTaskStatus (mock)', taskId);
    return {
      task: {
        id: taskId,
        description: 'Mock task',
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  return invoke<TaskStatusResponse>('agent_get_task_status', { taskId });
}

/**
 * List all tasks managed by the agent.
 */
export async function agentListTasks(): Promise<ListTasksResponse> {
  if (!isTauri) {
    console.info('[agent] agentListTasks (mock)');
    return { tasks: [] };
  }

  return invoke<ListTasksResponse>('agent_list_tasks');
}

// ============================================================================
// Trusted Workflows
// ============================================================================

/**
 * List all trusted workflows and their approved tool lists.
 * Returns a map of workflow hash -> approved tool names.
 */
export async function agentListTrustedWorkflows(): Promise<TrustedWorkflowMap> {
  if (!isTauri) {
    console.info('[agent] agentListTrustedWorkflows (mock)');
    return {};
  }

  return invoke<TrustedWorkflowMap>('agent_list_trusted_workflows');
}

// ============================================================================
// Agent Lifecycle
// ============================================================================

/**
 * Stop the autonomous agent.
 * Gracefully shuts down the agent loop.
 */
export async function agentStop(): Promise<void> {
  if (!isTauri) {
    console.info('[agent] agentStop (mock)');
    return;
  }

  return invoke<void>('agent_stop');
}

// ============================================================================
// Billing-Aware Agent Task
// ============================================================================

/**
 * Start an agent task with automatic billing-aware model selection.
 * The backend selects the best model based on the user's subscription tier.
 * Returns the LLM response content.
 */
export async function startAgentTask(
  goal: string,
  mode: string = 'default',
  userId?: string,
): Promise<string> {
  if (!isTauri) {
    console.info('[agent] startAgentTask (mock)', goal);
    return `[Mock] Agent response for: ${goal}`;
  }

  return invoke<string>('start_agent_task', {
    goal,
    mode,
    userId,
  });
}

// ============================================================================
// Approval Management
// ============================================================================

/** Decision for an approval request */
export type ApprovalDecision = 'approve' | 'reject';

/**
 * Resolve a pending tool execution approval.
 * Used by the approval UI to approve or reject tool calls.
 */
export async function resolveApproval(
  approvalId: string,
  decision: ApprovalDecision,
  options?: { trust?: boolean; reason?: string },
): Promise<void> {
  if (!isTauri) {
    console.info('[agent] resolveApproval (mock)', { approvalId, decision });
    return;
  }

  return invoke<void>('agent_resolve_approval', {
    approvalId,
    decision,
    trust: options?.trust,
    reason: options?.reason,
  });
}
