
import { invoke, isTauri } from '../lib/tauri-mock';

export interface AgentConfig {
  maxConcurrentSteps?: number;
  defaultStepTimeoutSecs?: number;
  autoApprove?: boolean;
}

export interface AgentSubmitTaskRequest {
  description: string;
  autoApprove?: boolean;
}

export interface SubmitTaskResponse {
  taskId: string;
}

export interface TaskStatusResponse {
  task: AgentTask;
}

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

export interface AgentTaskStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface ListTasksResponse {
  tasks: AgentTask[];
}

export type TrustedWorkflowMap = Record<string, string[]>;

export async function agentInit(config?: AgentConfig): Promise<void> {
  if (!isTauri) {
    console.debug('[agent] agentInit (mock)', config);
    return;
  }

  return invoke<void>('agent_init', {
    config: config ?? {},
  });
}

export async function agentSubmitTask(
  description: string,
  autoApprove?: boolean,
): Promise<SubmitTaskResponse> {
  if (!isTauri) {
    console.debug('[agent] agentSubmitTask (mock)', description);
    return { taskId: `mock_task_${Date.now()}` };
  }

  return invoke<SubmitTaskResponse>('agent_submit_task', {
    request: { description, autoApprove } satisfies AgentSubmitTaskRequest,
  });
}

export async function agentGetTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  if (!isTauri) {
    console.debug('[agent] agentGetTaskStatus (mock)', taskId);
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

export async function agentListTasks(): Promise<ListTasksResponse> {
  if (!isTauri) {
    console.debug('[agent] agentListTasks (mock)');
    return { tasks: [] };
  }

  return invoke<ListTasksResponse>('agent_list_tasks');
}

export async function agentListTrustedWorkflows(): Promise<TrustedWorkflowMap> {
  if (!isTauri) {
    console.debug('[agent] agentListTrustedWorkflows (mock)');
    return {};
  }

  return invoke<TrustedWorkflowMap>('agent_list_trusted_workflows');
}

export async function agentStop(): Promise<void> {
  if (!isTauri) {
    console.debug('[agent] agentStop (mock)');
    return;
  }

  return invoke<void>('agent_stop');
}

export async function startAgentTask(
  goal: string,
  mode: string = 'default',
  userId?: string,
): Promise<string> {
  if (!isTauri) {
    console.debug('[agent] startAgentTask (mock)', goal);
    return `[Mock] Agent response for: ${goal}`;
  }

  return invoke<string>('start_agent_task', {
    goal,
    mode,
    userId,
  });
}

export type ApprovalDecision = 'approve' | 'reject';

export async function resolveApproval(
  approvalId: string,
  decision: ApprovalDecision,
  options?: { trust?: boolean; reason?: string },
): Promise<void> {
  if (!isTauri) {
    console.debug('[agent] resolveApproval (mock)', { approvalId, decision });
    return;
  }

  return invoke<void>('agent_resolve_approval', {
    approvalId,
    decision,
    trust: options?.trust,
    reason: options?.reason,
  });
}
