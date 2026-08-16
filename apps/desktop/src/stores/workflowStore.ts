// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

export type ExecutionLogSource = 'workflow' | 'browser' | 'agent' | 'tool';

export type ExecutionLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ExecutionLog {
  id: string;
  source: ExecutionLogSource;
  runId: string;
  nodeId?: string;
  level: ExecutionLogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
  durationMs?: number;
  success?: boolean;
}

export interface WorkflowNode {
  type: string;
  id: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: Record<string, unknown>;
}

export interface WorkflowTrigger {
  type: string;
  config: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: WorkflowTrigger[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  currentNodeId: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

export type LogEventType = 'started' | 'completed' | 'failed' | 'skipped';

export interface WorkflowExecutionLog {
  id: string;
  executionId: string;
  nodeId: string;
  eventType: LogEventType;
  data: unknown | null;
  timestamp: number;
}

interface WorkflowState {
  workflows: WorkflowDefinition[];
  activeExecution: WorkflowExecution | null;
  executionLogs: WorkflowExecutionLog[];
  isLoading: boolean;
  error: string | null;

  createWorkflow: (definition: WorkflowDefinition) => Promise<string>;
  updateWorkflow: (id: string, definition: WorkflowDefinition) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  getWorkflow: (id: string) => Promise<WorkflowDefinition>;
  fetchUserWorkflows: (userId: string) => Promise<void>;

  executeWorkflow: (workflowId: string, inputs: Record<string, unknown>) => Promise<string>;
  pauseWorkflow: (executionId: string) => Promise<void>;
  resumeWorkflow: (executionId: string) => Promise<void>;
  cancelWorkflow: (executionId: string) => Promise<void>;

  getWorkflowStatus: (executionId: string) => Promise<WorkflowExecution>;
  fetchExecutionLogs: (executionId: string) => Promise<void>;

  scheduleWorkflow: (workflowId: string, cronExpr: string, timezone?: string) => Promise<void>;
  triggerWorkflowOnEvent: (
    workflowId: string,
    eventType: string,
    eventData: Record<string, unknown>,
  ) => Promise<string>;
  getNextExecutionTime: (cronExpr: string) => Promise<number>;
}

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    (set) => ({
      workflows: [],
      activeExecution: null,
      executionLogs: [],
      isLoading: false,
      error: null,

      createWorkflow: async (definition) => {
        return invoke<string>('create_workflow', { definition });
      },

      updateWorkflow: async (id, definition) => {
        await invoke('update_workflow', { id, definition });
        set((state) => ({
          workflows: state.workflows.map((w) => (w.id === id ? definition : w)),
        }));
      },

      deleteWorkflow: async (id) => {
        await invoke('delete_workflow', { id });
        set((state) => ({
          workflows: state.workflows.filter((w) => w.id !== id),
        }));
      },

      getWorkflow: async (id) => {
        return invoke<WorkflowDefinition>('get_workflow', { id });
      },

      fetchUserWorkflows: async (userId) => {
        set({ isLoading: true, error: null });
        try {
          const workflows = await invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
          set({ workflows, isLoading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch workflows',
            isLoading: false,
          });
        }
      },

      executeWorkflow: async (workflowId, inputs) => {
        const executionId = await invoke<string>('execute_workflow', { workflowId, inputs });
        return executionId;
      },

      pauseWorkflow: async (executionId) => {
        await invoke('pause_workflow', { executionId });
      },

      resumeWorkflow: async (executionId) => {
        await invoke('resume_workflow', { executionId });
      },

      cancelWorkflow: async (executionId) => {
        await invoke('cancel_workflow', { executionId });
      },

      getWorkflowStatus: async (executionId) => {
        const execution = await invoke<WorkflowExecution>('get_workflow_status', { executionId });
        set({ activeExecution: execution });
        return execution;
      },

      fetchExecutionLogs: async (executionId) => {
        try {
          const executionLogs = await invoke<WorkflowExecutionLog[]>('get_execution_logs', {
            executionId,
          });
          set({ executionLogs });
        } catch {
          // non-fatal
        }
      },

      scheduleWorkflow: async (workflowId, cronExpr, timezone) => {
        await invoke('schedule_workflow', {
          workflowId,
          cronExpr,
          timezone: timezone ?? null,
        });
      },

      triggerWorkflowOnEvent: async (workflowId, eventType, eventData) => {
        return invoke<string>('trigger_workflow_on_event', {
          workflowId,
          eventType,
          eventData,
        });
      },

      getNextExecutionTime: async (cronExpr) => {
        return invoke<number>('get_next_execution_time', { cronExpr });
      },
    }),
    { name: 'workflow' },
  ),
);
