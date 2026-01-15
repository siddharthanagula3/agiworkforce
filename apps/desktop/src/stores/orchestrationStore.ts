import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import type {
  NodeLibraryItem,
  ScheduledWorkflow,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowNode,
} from '../types/workflow';

interface OrchestrationState {
  workflows: WorkflowDefinition[];
  selectedWorkflow: WorkflowDefinition | null;
  currentExecution: WorkflowExecution | null;
  executionLogs: WorkflowExecutionLog[];
  loadingWorkflows: boolean;
  loadingExecution: boolean;
  error: string | null;

  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNode: WorkflowNode | null;

  nodeLibrary: NodeLibraryItem[];

  scheduledWorkflows: ScheduledWorkflow[];

  loadWorkflows: (userId: string) => Promise<void>;
  createWorkflow: (workflow: Partial<WorkflowDefinition>) => Promise<string | null>;
  updateWorkflow: (id: string, workflow: WorkflowDefinition) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  selectWorkflow: (workflow: WorkflowDefinition | null) => void;
  getWorkflow: (id: string) => Promise<WorkflowDefinition | null>;

  executeWorkflow: (workflowId: string, inputs: Record<string, any>) => Promise<string | null>;
  pauseWorkflow: (executionId: string) => Promise<void>;
  resumeWorkflow: (executionId: string) => Promise<void>;
  cancelWorkflow: (executionId: string) => Promise<void>;
  getExecutionStatus: (executionId: string) => Promise<void>;
  getExecutionLogs: (executionId: string) => Promise<void>;
  /** Stop polling for execution status updates */
  stopExecutionPolling: () => void;

  scheduleWorkflow: (workflowId: string, cronExpr: string, timezone?: string) => Promise<void>;
  getNextExecutionTime: (cronExpr: string) => Promise<number | null>;

  addNode: (node: WorkflowNode) => void;
  updateNode: (id: string, updates: Partial<WorkflowNode>) => void;
  deleteNode: (id: string) => void;
  selectNode: (node: WorkflowNode | null) => void;
  addEdge: (edge: WorkflowEdge) => void;
  deleteEdge: (id: string) => void;
  clearCanvas: () => void;

  clearError: () => void;
  reset: () => void;
}

// Track active polling timers to prevent memory leaks
let executionPollingTimer: ReturnType<typeof setTimeout> | null = null;

const defaultNodeLibrary: NodeLibraryItem[] = [
  {
    type: 'agent',
    label: 'Agent',
    description: 'Execute an agent template',
    icon: 'bot',
    category: 'action',
  },
  {
    type: 'decision',
    label: 'Decision',
    description: 'Conditional branching',
    icon: 'git-branch',
    category: 'control',
  },
  {
    type: 'loop',
    label: 'Loop',
    description: 'Repeat steps',
    icon: 'repeat',
    category: 'control',
  },
  {
    type: 'parallel',
    label: 'Parallel',
    description: 'Execute multiple branches',
    icon: 'git-fork',
    category: 'control',
  },
  {
    type: 'wait',
    label: 'Wait',
    description: 'Delay execution',
    icon: 'clock',
    category: 'control',
  },
  {
    type: 'script',
    label: 'Script',
    description: 'Execute custom code',
    icon: 'code',
    category: 'action',
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'Execute a tool',
    icon: 'wrench',
    category: 'integration',
  },
];

export const useOrchestrationStore = create<OrchestrationState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      workflows: [],
      selectedWorkflow: null,
      currentExecution: null,
      executionLogs: [],
      loadingWorkflows: false,
      loadingExecution: false,
      error: null,
      nodes: [],
      edges: [],
      selectedNode: null,
      nodeLibrary: defaultNodeLibrary,
      scheduledWorkflows: [],

      loadWorkflows: async (userId: string) => {
        set({ loadingWorkflows: true, error: null });
        try {
          const workflows = await invoke<WorkflowDefinition[]>('get_user_workflows', { userId });
          set({ workflows, loadingWorkflows: false });
        } catch (error) {
          set({ error: String(error), loadingWorkflows: false });
        }
      },

      createWorkflow: async (workflow: Partial<WorkflowDefinition>) => {
        set({ error: null });
        try {
          const workflowDef: WorkflowDefinition = {
            id: '',
            user_id: workflow.user_id || 'anonymous',
            name: workflow.name || 'Untitled Workflow',
            description: workflow.description,
            nodes: workflow.nodes || [],
            edges: workflow.edges || [],
            triggers: workflow.triggers || [],
            metadata: workflow.metadata || {},
            created_at: Date.now(),
            updated_at: Date.now(),
          };

          const id = await invoke<string>('create_workflow', { definition: workflowDef });

          await get().loadWorkflows(workflowDef.user_id);

          return id;
        } catch (error) {
          set({ error: String(error) });
          return null;
        }
      },

      updateWorkflow: async (id: string, workflow: WorkflowDefinition) => {
        set({ error: null });
        try {
          await invoke('update_workflow', { id, definition: workflow });

          set((state) => ({
            workflows: state.workflows.map((w) => (w.id === id ? workflow : w)),
            selectedWorkflow: state.selectedWorkflow?.id === id ? workflow : state.selectedWorkflow,
          }));
        } catch (error) {
          set({ error: String(error) });
        }
      },

      deleteWorkflow: async (id: string) => {
        set({ error: null });
        try {
          await invoke('delete_workflow', { id });

          set((state) => ({
            workflows: state.workflows.filter((w) => w.id !== id),
            selectedWorkflow: state.selectedWorkflow?.id === id ? null : state.selectedWorkflow,
          }));
        } catch (error) {
          set({ error: String(error) });
        }
      },

      selectWorkflow: (workflow: WorkflowDefinition | null) => {
        set({
          selectedWorkflow: workflow,
          nodes: workflow?.nodes || [],
          edges: workflow?.edges || [],
        });
      },

      getWorkflow: async (id: string) => {
        set({ error: null });
        try {
          const workflow = await invoke<WorkflowDefinition>('get_workflow', { id });
          return workflow;
        } catch (error) {
          set({ error: String(error) });
          return null;
        }
      },

      executeWorkflow: async (workflowId: string, inputs: Record<string, any>) => {
        set({ loadingExecution: true, error: null });
        try {
          const executionId = await invoke<string>('execute_workflow', { workflowId, inputs });

          // Clear any existing polling timer before starting a new one
          if (executionPollingTimer) {
            clearTimeout(executionPollingTimer);
          }
          executionPollingTimer = setTimeout(() => {
            get().getExecutionStatus(executionId);
          }, 1000);

          return executionId;
        } catch (error) {
          set({ error: String(error), loadingExecution: false });
          return null;
        }
      },

      pauseWorkflow: async (executionId: string) => {
        set({ error: null });
        try {
          await invoke('pause_workflow', { executionId });
          await get().getExecutionStatus(executionId);
        } catch (error) {
          set({ error: String(error) });
        }
      },

      resumeWorkflow: async (executionId: string) => {
        set({ error: null });
        try {
          await invoke('resume_workflow', { executionId });
          await get().getExecutionStatus(executionId);
        } catch (error) {
          set({ error: String(error) });
        }
      },

      cancelWorkflow: async (executionId: string) => {
        set({ error: null });
        try {
          await invoke('cancel_workflow', { executionId });
          await get().getExecutionStatus(executionId);
        } catch (error) {
          set({ error: String(error) });
        }
      },

      getExecutionStatus: async (executionId: string) => {
        set({ error: null });
        try {
          const execution = await invoke<WorkflowExecution>('get_workflow_status', { executionId });
          set({ currentExecution: execution, loadingExecution: false });

          if (execution.status === 'running' || execution.status === 'pending') {
            // Clear any existing timer before scheduling a new one
            if (executionPollingTimer) {
              clearTimeout(executionPollingTimer);
            }
            executionPollingTimer = setTimeout(() => {
              get().getExecutionStatus(executionId);
            }, 2000);
          } else {
            // Execution finished - clear the timer reference
            executionPollingTimer = null;
          }
        } catch (error) {
          set({ error: String(error), loadingExecution: false });
          // Clear timer on error to prevent orphaned polling
          if (executionPollingTimer) {
            clearTimeout(executionPollingTimer);
            executionPollingTimer = null;
          }
        }
      },

      stopExecutionPolling: () => {
        if (executionPollingTimer) {
          clearTimeout(executionPollingTimer);
          executionPollingTimer = null;
        }
      },

      getExecutionLogs: async (executionId: string) => {
        set({ error: null });
        try {
          const logs = await invoke<WorkflowExecutionLog[]>('get_execution_logs', { executionId });
          set({ executionLogs: logs });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      scheduleWorkflow: async (workflowId: string, cronExpr: string, timezone?: string) => {
        set({ error: null });
        try {
          await invoke('schedule_workflow', { workflowId, cronExpr, timezone });
        } catch (error) {
          set({ error: String(error) });
        }
      },

      getNextExecutionTime: async (cronExpr: string) => {
        set({ error: null });
        try {
          const timestamp = await invoke<number>('get_next_execution_time', { cronExpr });
          return timestamp;
        } catch (error) {
          set({ error: String(error) });
          return null;
        }
      },

      addNode: (node: WorkflowNode) => {
        set((state) => ({
          nodes: [...state.nodes, node],
        }));
      },

      updateNode: (id: string, updates: Partial<WorkflowNode>) => {
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? ({ ...node, ...updates } as WorkflowNode) : node,
          ),
        }));
      },

      deleteNode: (id: string) => {
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== id),
          edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
          selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
        }));
      },

      selectNode: (node: WorkflowNode | null) => {
        set({ selectedNode: node });
      },

      addEdge: (edge: WorkflowEdge) => {
        set((state) => ({
          edges: [...state.edges, edge],
        }));
      },

      deleteEdge: (id: string) => {
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== id),
        }));
      },

      clearCanvas: () => {
        set({ nodes: [], edges: [], selectedNode: null });
      },

      clearError: () => set({ error: null }),

      reset: () => {
        // Stop any active execution polling before resetting state
        if (executionPollingTimer) {
          clearTimeout(executionPollingTimer);
          executionPollingTimer = null;
        }

        set({
          workflows: [],
          selectedWorkflow: null,
          currentExecution: null,
          executionLogs: [],
          loadingWorkflows: false,
          loadingExecution: false,
          error: null,
          nodes: [],
          edges: [],
          selectedNode: null,
        });
      },
    })),
    { name: 'OrchestrationStore', enabled: import.meta.env.DEV },
  ),
);
