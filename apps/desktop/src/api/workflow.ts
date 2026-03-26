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
    console.debug('[workflow] createWorkflow (mock)', definition.name);
    return `mock-workflow-${Date.now()}`;
  }

  try {
    return await invoke<string>('create_workflow', { definition });
  } catch (error) {
    console.error('[workflow] failed to create workflow:', error);
    throw error;
  }
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(id: string, definition: WorkflowDefinition): Promise<void> {
  if (!isTauri) {
    console.debug('[workflow] updateWorkflow (mock)', id);
    return;
  }

  try {
    await invoke('update_workflow', { id, definition });
  } catch (error) {
    console.error('[workflow] failed to update workflow:', error);
    throw error;
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
  if (!isTauri) {
    console.debug('[workflow] deleteWorkflow (mock)', id);
    return;
  }

  try {
    await invoke('delete_workflow', { id });
  } catch (error) {
    console.error('[workflow] failed to delete workflow:', error);
    throw error;
  }
}

/**
 * Get a workflow by ID
 */
export async function getWorkflow(id: string): Promise<WorkflowDefinition> {
  if (!isTauri) {
    console.debug('[workflow] getWorkflow (mock)', id);
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

  try {
    return await invoke<WorkflowDefinition>('get_workflow', { id });
  } catch (error) {
    console.error('[workflow] failed to get workflow:', error);
    throw error;
  }
}

/**
 * Get all workflows for a user
 */
export async function getUserWorkflows(userId: string): Promise<WorkflowDefinition[]> {
  if (!isTauri) {
    console.debug('[workflow] getUserWorkflows (mock)', userId);
    return [];
  }

  try {
    return await invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
  } catch (error) {
    console.error('[workflow] failed to get user workflows:', error);
    throw error;
  }
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown> = {},
): Promise<string> {
  if (!isTauri) {
    console.debug('[workflow] executeWorkflow (mock)', workflowId);
    return `mock-execution-${Date.now()}`;
  }

  try {
    return await invoke<string>('execute_workflow', { workflowId, inputs });
  } catch (error) {
    console.error('[workflow] failed to execute workflow:', error);
    throw error;
  }
}

/**
 * Pause a workflow execution
 */
export async function pauseWorkflow(executionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[workflow] pauseWorkflow (mock)', executionId);
    return;
  }

  try {
    await invoke('pause_workflow', { executionId });
  } catch (error) {
    console.error('[workflow] failed to pause workflow:', error);
    throw error;
  }
}

/**
 * Resume a paused workflow execution
 */
export async function resumeWorkflow(executionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[workflow] resumeWorkflow (mock)', executionId);
    return;
  }

  try {
    await invoke('resume_workflow', { executionId });
  } catch (error) {
    console.error('[workflow] failed to resume workflow:', error);
    throw error;
  }
}

/**
 * Cancel a workflow execution
 */
export async function cancelWorkflow(executionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[workflow] cancelWorkflow (mock)', executionId);
    return;
  }

  try {
    await invoke('cancel_workflow', { executionId });
  } catch (error) {
    console.error('[workflow] failed to cancel workflow:', error);
    throw error;
  }
}

/**
 * Get workflow execution status
 */
export async function getWorkflowStatus(executionId: string): Promise<WorkflowExecution> {
  if (!isTauri) {
    console.debug('[workflow] getWorkflowStatus (mock)', executionId);
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

  try {
    return await invoke<WorkflowExecution>('get_workflow_status', { executionId });
  } catch (error) {
    console.error('[workflow] failed to get workflow status:', error);
    throw error;
  }
}

/**
 * Get execution logs for a workflow execution
 */
export async function getExecutionLogs(executionId: string): Promise<WorkflowExecutionLog[]> {
  if (!isTauri) {
    console.debug('[workflow] getExecutionLogs (mock)', executionId);
    return [];
  }

  try {
    return await invoke<WorkflowExecutionLog[]>('get_execution_logs', { executionId });
  } catch (error) {
    console.error('[workflow] failed to get execution logs:', error);
    throw error;
  }
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
    console.debug('[workflow] scheduleWorkflow (mock)', workflowId, cronExpr);
    return;
  }

  try {
    await invoke('schedule_workflow', { workflowId, cronExpr, timezone });
  } catch (error) {
    console.error('[workflow] failed to schedule workflow:', error);
    throw error;
  }
}

/**
 * Get the next execution time for a cron expression
 */
export async function getNextExecutionTime(cronExpr: string): Promise<number> {
  if (!isTauri) {
    console.debug('[workflow] getNextExecutionTime (mock)', cronExpr);
    return Date.now() + 3600000; // 1 hour from now
  }

  try {
    return await invoke<number>('get_next_execution_time', { cronExpr });
  } catch (error) {
    console.error('[workflow] failed to get next execution time:', error);
    throw error;
  }
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
    console.debug('[workflow] triggerWorkflowOnEvent (mock)', workflowId, eventType);
    return `mock-execution-${Date.now()}`;
  }

  try {
    return await invoke<string>('trigger_workflow_on_event', {
      workflowId,
      eventType,
      eventData,
    });
  } catch (error) {
    console.error('[workflow] failed to trigger workflow on event:', error);
    throw error;
  }
}
