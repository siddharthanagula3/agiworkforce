/**
 * Workflow Store
 *
 * Zustand store for managing workflow orchestration state.
 * Wires all 13 Tauri commands from orchestration.rs:
 * - create_workflow, update_workflow, delete_workflow, get_workflow
 * - get_user_workflows, execute_workflow, pause_workflow, resume_workflow
 * - cancel_workflow, get_workflow_status, get_execution_logs
 * - schedule_workflow, trigger_workflow_on_event, get_next_execution_time
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionLog,
} from '../types/workflow';

// ---- Types ----

export type WorkflowRunStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface WorkflowState {
  /** All workflows for the current user */
  workflows: WorkflowDefinition[];
  /** Currently selected workflow (for editing / viewing) */
  selectedWorkflow: WorkflowDefinition | null;
  /** Active executions keyed by execution ID */
  executions: Map<string, WorkflowExecution>;
  /** Execution logs keyed by execution ID */
  executionLogs: Map<string, WorkflowExecutionLog[]>;

  /** Loading flags */
  loadingWorkflows: boolean;
  loadingExecution: boolean;

  /** Error state */
  error: string | null;
}

interface WorkflowActions {
  // CRUD
  createWorkflow: (definition: WorkflowDefinition) => Promise<string | null>;
  updateWorkflow: (id: string, definition: WorkflowDefinition) => Promise<boolean>;
  deleteWorkflow: (id: string) => Promise<boolean>;
  getWorkflow: (id: string) => Promise<WorkflowDefinition | null>;
  loadUserWorkflows: (userId: string) => Promise<void>;

  // Execution lifecycle
  executeWorkflow: (workflowId: string, inputs?: Record<string, unknown>) => Promise<string | null>;
  pauseWorkflow: (executionId: string) => Promise<boolean>;
  resumeWorkflow: (executionId: string) => Promise<boolean>;
  cancelWorkflow: (executionId: string) => Promise<boolean>;
  getWorkflowStatus: (executionId: string) => Promise<WorkflowExecution | null>;
  getExecutionLogs: (executionId: string) => Promise<WorkflowExecutionLog[]>;

  // Scheduling
  scheduleWorkflow: (workflowId: string, cronExpr: string, timezone?: string) => Promise<boolean>;
  triggerWorkflowOnEvent: (
    workflowId: string,
    eventType: string,
    eventData?: Record<string, unknown>,
  ) => Promise<string | null>;
  getNextExecutionTime: (cronExpr: string) => Promise<number | null>;

  // UI helpers
  selectWorkflow: (workflow: WorkflowDefinition | null) => void;
  clearError: () => void;
  reset: () => void;
}

// ---- Store ----

export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  devtools(
    immer((set, _get) => ({
      // Initial state
      workflows: [],
      selectedWorkflow: null,
      executions: new Map(),
      executionLogs: new Map(),
      loadingWorkflows: false,
      loadingExecution: false,
      error: null,

      // ---- CRUD ----

      createWorkflow: async (definition) => {
        set({ error: null }, undefined, 'workflow/create/start');
        try {
          const id = await invoke<string>('create_workflow', { definition });
          const created = { ...definition, id };
          set(
            (state) => {
              state.workflows.push(created);
            },
            undefined,
            'workflow/create/success',
          );
          return id;
        } catch (error) {
          console.error('Failed to create workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/create/error');
          return null;
        }
      },

      updateWorkflow: async (id, definition) => {
        set({ error: null }, undefined, 'workflow/update/start');
        try {
          await invoke('update_workflow', { id, definition });
          set(
            (state) => {
              const idx = state.workflows.findIndex((w) => w.id === id);
              if (idx >= 0) {
                state.workflows[idx] = { ...definition, id };
              }
              if (state.selectedWorkflow?.id === id) {
                state.selectedWorkflow = { ...definition, id };
              }
            },
            undefined,
            'workflow/update/success',
          );
          return true;
        } catch (error) {
          console.error('Failed to update workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/update/error');
          return false;
        }
      },

      deleteWorkflow: async (id) => {
        set({ error: null }, undefined, 'workflow/delete/start');
        try {
          await invoke('delete_workflow', { id });
          set(
            (state) => {
              state.workflows = state.workflows.filter((w) => w.id !== id);
              if (state.selectedWorkflow?.id === id) {
                state.selectedWorkflow = null;
              }
            },
            undefined,
            'workflow/delete/success',
          );
          return true;
        } catch (error) {
          console.error('Failed to delete workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/delete/error');
          return false;
        }
      },

      getWorkflow: async (id) => {
        set({ error: null }, undefined, 'workflow/get/start');
        try {
          const workflow = await invoke<WorkflowDefinition>('get_workflow', { id });
          set(
            (state) => {
              const idx = state.workflows.findIndex((w) => w.id === id);
              if (idx >= 0) {
                state.workflows[idx] = workflow;
              } else {
                state.workflows.push(workflow);
              }
            },
            undefined,
            'workflow/get/success',
          );
          return workflow;
        } catch (error) {
          console.error('Failed to get workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/get/error');
          return null;
        }
      },

      loadUserWorkflows: async (userId) => {
        set({ loadingWorkflows: true, error: null }, undefined, 'workflow/loadAll/start');
        try {
          const workflows = await invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
          set({ workflows, loadingWorkflows: false }, undefined, 'workflow/loadAll/success');
        } catch (error) {
          console.error('Failed to load user workflows:', error);
          set(
            { error: String(error), loadingWorkflows: false },
            undefined,
            'workflow/loadAll/error',
          );
        }
      },

      // ---- Execution lifecycle ----

      executeWorkflow: async (workflowId, inputs = {}) => {
        set({ loadingExecution: true, error: null }, undefined, 'workflow/execute/start');
        try {
          const executionId = await invoke<string>('execute_workflow', {
            workflowId,
            inputs,
          });
          set(
            (state) => {
              state.loadingExecution = false;
              state.executions.set(executionId, {
                id: executionId,
                workflow_id: workflowId,
                status: 'running',
                inputs,
                outputs: {},
                started_at: Date.now(),
              });
            },
            undefined,
            'workflow/execute/success',
          );
          return executionId;
        } catch (error) {
          console.error('Failed to execute workflow:', error);
          set(
            { error: String(error), loadingExecution: false },
            undefined,
            'workflow/execute/error',
          );
          return null;
        }
      },

      pauseWorkflow: async (executionId) => {
        try {
          await invoke('pause_workflow', { executionId });
          set(
            (state) => {
              const exec = state.executions.get(executionId);
              if (exec) {
                state.executions.set(executionId, { ...exec, status: 'paused' });
              }
            },
            undefined,
            'workflow/pause/success',
          );
          return true;
        } catch (error) {
          console.error('Failed to pause workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/pause/error');
          return false;
        }
      },

      resumeWorkflow: async (executionId) => {
        try {
          await invoke('resume_workflow', { executionId });
          set(
            (state) => {
              const exec = state.executions.get(executionId);
              if (exec) {
                state.executions.set(executionId, { ...exec, status: 'running' });
              }
            },
            undefined,
            'workflow/resume/success',
          );
          return true;
        } catch (error) {
          console.error('Failed to resume workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/resume/error');
          return false;
        }
      },

      cancelWorkflow: async (executionId) => {
        try {
          await invoke('cancel_workflow', { executionId });
          set(
            (state) => {
              const exec = state.executions.get(executionId);
              if (exec) {
                state.executions.set(executionId, { ...exec, status: 'cancelled' });
              }
            },
            undefined,
            'workflow/cancel/success',
          );
          return true;
        } catch (error) {
          console.error('Failed to cancel workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/cancel/error');
          return false;
        }
      },

      getWorkflowStatus: async (executionId) => {
        try {
          const execution = await invoke<WorkflowExecution>('get_workflow_status', {
            executionId,
          });
          set(
            (state) => {
              state.executions.set(executionId, execution);
            },
            undefined,
            'workflow/status/success',
          );
          return execution;
        } catch (error) {
          console.error('Failed to get workflow status:', error);
          return null;
        }
      },

      getExecutionLogs: async (executionId) => {
        try {
          const logs = await invoke<WorkflowExecutionLog[]>('get_execution_logs', {
            executionId,
          });
          set(
            (state) => {
              state.executionLogs.set(executionId, logs);
            },
            undefined,
            'workflow/logs/success',
          );
          return logs;
        } catch (error) {
          console.error('Failed to get execution logs:', error);
          return [];
        }
      },

      // ---- Scheduling ----

      scheduleWorkflow: async (workflowId, cronExpr, timezone) => {
        try {
          await invoke('schedule_workflow', { workflowId, cronExpr, timezone });
          return true;
        } catch (error) {
          console.error('Failed to schedule workflow:', error);
          set({ error: String(error) }, undefined, 'workflow/schedule/error');
          return false;
        }
      },

      triggerWorkflowOnEvent: async (workflowId, eventType, eventData = {}) => {
        try {
          const executionId = await invoke<string>('trigger_workflow_on_event', {
            workflowId,
            eventType,
            eventData,
          });
          return executionId;
        } catch (error) {
          console.error('Failed to trigger workflow on event:', error);
          set({ error: String(error) }, undefined, 'workflow/trigger/error');
          return null;
        }
      },

      getNextExecutionTime: async (cronExpr) => {
        try {
          const timestamp = await invoke<number>('get_next_execution_time', { cronExpr });
          return timestamp;
        } catch (error) {
          console.error('Failed to get next execution time:', error);
          return null;
        }
      },

      // ---- UI helpers ----

      selectWorkflow: (workflow) => {
        set({ selectedWorkflow: workflow }, undefined, 'workflow/select');
      },

      clearError: () => {
        set({ error: null }, undefined, 'workflow/clearError');
      },

      reset: () => {
        set(
          {
            workflows: [],
            selectedWorkflow: null,
            executions: new Map(),
            executionLogs: new Map(),
            loadingWorkflows: false,
            loadingExecution: false,
            error: null,
          },
          undefined,
          'workflow/reset',
        );
      },
    })),
    { name: 'WorkflowStore', enabled: import.meta.env.DEV },
  ),
);

// ---- Selectors ----

export const selectWorkflows = (state: WorkflowState) => state.workflows;
export const selectSelectedWorkflow = (state: WorkflowState) => state.selectedWorkflow;
export const selectLoadingWorkflows = (state: WorkflowState) => state.loadingWorkflows;
export const selectLoadingExecution = (state: WorkflowState) => state.loadingExecution;
export const selectWorkflowError = (state: WorkflowState) => state.error;
export const selectExecutions = (state: WorkflowState) => state.executions;
export const selectExecutionLogs = (state: WorkflowState) => state.executionLogs;
