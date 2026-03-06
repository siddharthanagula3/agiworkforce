import { invoke, isTauri } from '../lib/tauri-mock';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionLog,
} from '../types/workflow';

/**
 * Workflow API - Tauri command wrappers for workflow orchestration
 */

/**
 * Create a new workflow
 */
export async function createWorkflow(definition: WorkflowDefinition): Promise<string> {
  if (!isTauri) {
    console.info('[workflow] createWorkflow (mock)', definition.name);
    return `mock-workflow-${Date.now()}`;
  }

  return invoke<string>('create_workflow', { definition });
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(id: string, definition: WorkflowDefinition): Promise<void> {
  if (!isTauri) {
    console.info('[workflow] updateWorkflow (mock)', id);
    return;
  }

  await invoke('update_workflow', { id, definition });
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
  if (!isTauri) {
    console.info('[workflow] deleteWorkflow (mock)', id);
    return;
  }

  await invoke('delete_workflow', { id });
}

/**
 * Get a workflow by ID
 */
export async function getWorkflow(id: string): Promise<WorkflowDefinition> {
  if (!isTauri) {
    console.info('[workflow] getWorkflow (mock)', id);
    return {
      id,
      user_id: 'mock-user',
      name: 'Mock Workflow',
      description: 'A mock workflow for testing',
      nodes: [],
      edges: [],
      triggers: [{ type: 'manual' }],
      metadata: {},
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }

  return invoke<WorkflowDefinition>('get_workflow', { id });
}

/**
 * Get all workflows for a user
 */
export async function getUserWorkflows(userId: string): Promise<WorkflowDefinition[]> {
  if (!isTauri) {
    console.info('[workflow] getUserWorkflows (mock)', userId);
    return [];
  }

  return invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown> = {},
): Promise<string> {
  if (!isTauri) {
    console.info('[workflow] executeWorkflow (mock)', workflowId);
    return `mock-execution-${Date.now()}`;
  }

  return invoke<string>('execute_workflow', { workflowId, inputs });
}

/**
 * Pause a workflow execution
 */
export async function pauseWorkflow(executionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[workflow] pauseWorkflow (mock)', executionId);
    return;
  }

  await invoke('pause_workflow', { executionId });
}

/**
 * Resume a paused workflow execution
 */
export async function resumeWorkflow(executionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[workflow] resumeWorkflow (mock)', executionId);
    return;
  }

  await invoke('resume_workflow', { executionId });
}

/**
 * Cancel a workflow execution
 */
export async function cancelWorkflow(executionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[workflow] cancelWorkflow (mock)', executionId);
    return;
  }

  await invoke('cancel_workflow', { executionId });
}

/**
 * Get workflow execution status
 */
export async function getWorkflowStatus(executionId: string): Promise<WorkflowExecution> {
  if (!isTauri) {
    console.info('[workflow] getWorkflowStatus (mock)', executionId);
    return {
      id: executionId,
      workflow_id: 'mock-workflow',
      status: 'completed',
      inputs: {},
      outputs: {},
      started_at: Date.now() - 60000,
      completed_at: Date.now(),
    };
  }

  return invoke<WorkflowExecution>('get_workflow_status', { executionId });
}

/**
 * Get execution logs for a workflow execution
 */
export async function getExecutionLogs(executionId: string): Promise<WorkflowExecutionLog[]> {
  if (!isTauri) {
    console.info('[workflow] getExecutionLogs (mock)', executionId);
    return [];
  }

  return invoke<WorkflowExecutionLog[]>('get_execution_logs', { executionId });
}

/**
 * Schedule a workflow to run on a cron schedule
 */
export async function scheduleWorkflow(
  workflowId: string,
  cronExpr: string,
  timezone?: string,
): Promise<void> {
  if (!isTauri) {
    console.info('[workflow] scheduleWorkflow (mock)', workflowId, cronExpr);
    return;
  }

  await invoke('schedule_workflow', { workflowId, cronExpr, timezone });
}

/**
 * Get the next execution time for a cron expression
 */
export async function getNextExecutionTime(cronExpr: string): Promise<number> {
  if (!isTauri) {
    console.info('[workflow] getNextExecutionTime (mock)', cronExpr);
    return Date.now() + 3600000; // 1 hour from now
  }

  return invoke<number>('get_next_execution_time', { cronExpr });
}

/**
 * Trigger a workflow based on an event
 */
export async function triggerWorkflowOnEvent(
  workflowId: string,
  eventType: string,
  eventData: Record<string, unknown> = {},
): Promise<string> {
  if (!isTauri) {
    console.info('[workflow] triggerWorkflowOnEvent (mock)', workflowId, eventType);
    return `mock-execution-${Date.now()}`;
  }

  return invoke<string>('trigger_workflow_on_event', {
    workflowId,
    eventType,
    eventData,
  });
}
