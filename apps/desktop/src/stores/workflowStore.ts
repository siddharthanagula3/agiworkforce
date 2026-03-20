/**
 * Workflow Orchestration Store
 *
 * Wires all 15 orchestration Tauri commands from `sys/commands/orchestration.rs`:
 * CRUD for workflow definitions, execution lifecycle (execute, pause, resume, cancel),
 * status/logs, scheduling, event triggers, and next-execution-time queries.
 *
 * All invoke() params use camelCase per Tauri IPC rules.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

// ── Shared execution log type ────────────────────────────────────────────────
//
// Used by BOTH browser sessions and workflow runs so operator tooling can
// consume a single consistent format regardless of which surface produced the
// run.  Keep fields optional to allow partial emission at any lifecycle stage.

export type ExecutionLogSource = 'workflow' | 'browser' | 'agent' | 'tool';

export type ExecutionLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ExecutionLog {
  /** Unique log line ID */
  id: string;
  /** Which surface produced this entry */
  source: ExecutionLogSource;
  /** Identifies the run (workflow execution ID, browser session ID, agent task ID, etc.) */
  runId: string;
  /** Optional node / step within the run */
  nodeId?: string;
  /** Severity level */
  level: ExecutionLogLevel;
  /** Human-readable message */
  message: string;
  /** Arbitrary structured metadata (tool output, error details, etc.) */
  data?: Record<string, unknown>;
  /** Unix ms timestamp */
  timestamp: number;
  /** Wall-clock duration of this event in ms (if applicable) */
  durationMs?: number;
  /** Whether the event completed successfully */
  success?: boolean;
}

// ── Types (mirror Rust serde output — camelCase via Tauri) ──────────────────

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

// ── Store ───────────────────────────────────────────────────────────────────

interface WorkflowState {
  workflows: WorkflowDefinition[];
  activeExecution: WorkflowExecution | null;
  executionLogs: WorkflowExecutionLog[];
  isLoading: boolean;
  error: string | null;

  // ── CRUD ──────────────────────────────────────────────────────────────
  createWorkflow: (definition: WorkflowDefinition) => Promise<string>;
  updateWorkflow: (id: string, definition: WorkflowDefinition) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  getWorkflow: (id: string) => Promise<WorkflowDefinition>;
  fetchUserWorkflows: (userId: string) => Promise<void>;

  // ── Execution lifecycle ───────────────────────────────────────────────
  executeWorkflow: (workflowId: string, inputs: Record<string, unknown>) => Promise<string>;
  pauseWorkflow: (executionId: string) => Promise<void>;
  resumeWorkflow: (executionId: string) => Promise<void>;
  cancelWorkflow: (executionId: string) => Promise<void>;

  // ── Status / logs ─────────────────────────────────────────────────────
  getWorkflowStatus: (executionId: string) => Promise<WorkflowExecution>;
  fetchExecutionLogs: (executionId: string) => Promise<void>;

  // ── Scheduling ────────────────────────────────────────────────────────
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

      // ── CRUD ────────────────────────────────────────────────────────────

      createWorkflow: async (definition) => {
        return invoke<string>('create_workflow', { definition });
      },

      updateWorkflow: async (id, definition) => {
        await invoke('update_workflow', { id, definition });
        // Update local state
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

      // ── Execution lifecycle ─────────────────────────────────────────────

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

      // ── Status / logs ───────────────────────────────────────────────────

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

      // ── Scheduling ──────────────────────────────────────────────────────

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
