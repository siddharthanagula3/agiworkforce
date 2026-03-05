import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { listen } from '../lib/tauri-mock';
import {
  createWorkflow as apiCreateWorkflow,
  deleteWorkflow as apiDeleteWorkflow,
  executeWorkflow as apiExecuteWorkflow,
  getExecutionLogs,
  getUserWorkflows,
  getWorkflow as apiGetWorkflow,
  getWorkflowStatus as apiGetWorkflowStatus,
  pauseWorkflow as apiPauseWorkflow,
  resumeWorkflow as apiResumeWorkflow,
  cancelWorkflow as apiCancelWorkflow,
  scheduleWorkflow as apiScheduleWorkflow,
  updateWorkflow as apiUpdateWorkflow,
} from '../api/workflow';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowStatus,
} from '../types/workflow';

export interface WorkflowExecutionState {
  execution: WorkflowExecution;
  logs: WorkflowExecutionLog[];
}

export interface UseWorkflowsResult {
  // Data
  workflows: WorkflowDefinition[];
  activeExecutions: Map<string, WorkflowExecutionState>;

  // Loading states
  isLoading: boolean;
  isExecuting: boolean;

  // Error state
  error: string | null;

  // Actions
  list: (userId: string) => Promise<WorkflowDefinition[]>;
  get: (id: string) => Promise<WorkflowDefinition>;
  create: (definition: WorkflowDefinition) => Promise<string>;
  update: (id: string, definition: WorkflowDefinition) => Promise<void>;
  remove: (id: string) => Promise<void>;
  execute: (workflowId: string, inputs?: Record<string, unknown>) => Promise<string>;
  pause: (executionId: string) => Promise<void>;
  resume: (executionId: string) => Promise<void>;
  cancel: (executionId: string) => Promise<void>;
  getStatus: (executionId: string) => Promise<WorkflowExecution>;
  getLogs: (executionId: string) => Promise<WorkflowExecutionLog[]>;
  schedule: (workflowId: string, cronExpr: string, timezone?: string) => Promise<void>;

  // Helpers
  refresh: (userId: string) => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for managing workflows with real-time execution tracking
 */
export function useWorkflows(): UseWorkflowsResult {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [activeExecutions, setActiveExecutions] = useState<Map<string, WorkflowExecutionState>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track mounted state to prevent setState after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Listen for workflow execution events
  useEffect(() => {
    const unlistenPromises = [
      listen<{ execution_id: string; status: WorkflowStatus; node_id?: string }>(
        'workflow:status_changed',
        (event) => {
          if (!isMountedRef.current) return;

          const { execution_id, status, node_id } = event.payload;
          setActiveExecutions((prev) => {
            const current = prev.get(execution_id);
            if (!current) return prev;

            const updated = new Map(prev);
            updated.set(execution_id, {
              ...current,
              execution: {
                ...current.execution,
                status,
                current_node_id: node_id,
              },
            });
            return updated;
          });

          // Clear executing state when workflow completes
          if (['completed', 'failed', 'cancelled'].includes(status)) {
            setIsExecuting(false);
            if (status === 'completed') {
              toast.success('Workflow completed');
            }
          }
        },
      ),
      listen<WorkflowExecutionLog>('workflow:log', (event) => {
        if (!isMountedRef.current) return;

        const log = event.payload;
        setActiveExecutions((prev) => {
          const current = prev.get(log.execution_id);
          if (!current) return prev;

          const updated = new Map(prev);
          updated.set(log.execution_id, {
            ...current,
            logs: [...current.logs, log],
          });
          return updated;
        });
      }),
      listen<{ execution_id: string; error: string }>('workflow:error', (event) => {
        if (!isMountedRef.current) return;

        const { execution_id, error: errorMessage } = event.payload;
        setActiveExecutions((prev) => {
          const current = prev.get(execution_id);
          if (!current) return prev;

          const updated = new Map(prev);
          updated.set(execution_id, {
            ...current,
            execution: {
              ...current.execution,
              status: 'failed',
              error: errorMessage,
            },
          });
          return updated;
        });
        setError(errorMessage);
        setIsExecuting(false);
        toast.error('Workflow failed', { description: errorMessage });
      }),
    ];

    return () => {
      unlistenPromises.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(console.error);
      });
    };
  }, []);

  const list = useCallback(async (userId: string): Promise<WorkflowDefinition[]> => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const result = await getUserWorkflows(userId);
      if (isMountedRef.current) {
        setWorkflows(result);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const get = useCallback(async (id: string): Promise<WorkflowDefinition> => {
    if (isMountedRef.current) {
      setError(null);
    }

    try {
      return await apiGetWorkflow(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const create = useCallback(async (definition: WorkflowDefinition): Promise<string> => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const id = await apiCreateWorkflow(definition);
      if (isMountedRef.current) {
        setWorkflows((prev) => [...prev, { ...definition, id }]);
      }
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const update = useCallback(async (id: string, definition: WorkflowDefinition): Promise<void> => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await apiUpdateWorkflow(id, definition);
      if (isMountedRef.current) {
        setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...definition, id } : w)));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await apiDeleteWorkflow(id);
      if (isMountedRef.current) {
        setWorkflows((prev) => prev.filter((w) => w.id !== id));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const execute = useCallback(
    async (workflowId: string, inputs: Record<string, unknown> = {}): Promise<string> => {
      if (isMountedRef.current) {
        setIsExecuting(true);
        setError(null);
      }

      try {
        const executionId = await apiExecuteWorkflow(workflowId, inputs);

        // Initialize execution state
        if (isMountedRef.current) {
          setActiveExecutions((prev) => {
            const updated = new Map(prev);
            updated.set(executionId, {
              execution: {
                id: executionId,
                workflow_id: workflowId,
                status: 'running',
                inputs,
                outputs: {},
                started_at: Date.now(),
              },
              logs: [],
            });
            return updated;
          });
        }

        return executionId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(message);
          setIsExecuting(false);
        }
        throw err;
      }
    },
    [],
  );

  const pause = useCallback(async (executionId: string): Promise<void> => {
    if (isMountedRef.current) {
      setError(null);
    }

    try {
      await apiPauseWorkflow(executionId);
      if (isMountedRef.current) {
        setActiveExecutions((prev) => {
          const current = prev.get(executionId);
          if (!current) return prev;

          const updated = new Map(prev);
          updated.set(executionId, {
            ...current,
            execution: { ...current.execution, status: 'paused' },
          });
          return updated;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const resume = useCallback(async (executionId: string): Promise<void> => {
    if (isMountedRef.current) {
      setError(null);
    }

    try {
      await apiResumeWorkflow(executionId);
      if (isMountedRef.current) {
        setActiveExecutions((prev) => {
          const current = prev.get(executionId);
          if (!current) return prev;

          const updated = new Map(prev);
          updated.set(executionId, {
            ...current,
            execution: { ...current.execution, status: 'running' },
          });
          return updated;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const cancel = useCallback(async (executionId: string): Promise<void> => {
    if (isMountedRef.current) {
      setError(null);
    }

    try {
      await apiCancelWorkflow(executionId);
      if (isMountedRef.current) {
        setActiveExecutions((prev) => {
          const current = prev.get(executionId);
          if (!current) return prev;

          const updated = new Map(prev);
          updated.set(executionId, {
            ...current,
            execution: { ...current.execution, status: 'cancelled' },
          });
          return updated;
        });
        setIsExecuting(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const getStatus = useCallback(async (executionId: string): Promise<WorkflowExecution> => {
    if (isMountedRef.current) {
      setError(null);
    }

    try {
      const status = await apiGetWorkflowStatus(executionId);
      if (isMountedRef.current) {
        setActiveExecutions((prev) => {
          const current = prev.get(executionId);
          const updated = new Map(prev);
          updated.set(executionId, {
            execution: status,
            logs: current?.logs ?? [],
          });
          return updated;
        });
      }
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const getLogs = useCallback(async (executionId: string): Promise<WorkflowExecutionLog[]> => {
    if (isMountedRef.current) {
      setError(null);
    }

    try {
      const logs = await getExecutionLogs(executionId);
      if (isMountedRef.current) {
        setActiveExecutions((prev) => {
          const current = prev.get(executionId);
          if (!current) return prev;

          const updated = new Map(prev);
          updated.set(executionId, { ...current, logs });
          return updated;
        });
      }
      return logs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMountedRef.current) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const schedule = useCallback(
    async (workflowId: string, cronExpr: string, timezone?: string): Promise<void> => {
      if (isMountedRef.current) {
        setError(null);
      }

      try {
        await apiScheduleWorkflow(workflowId, cronExpr, timezone);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMountedRef.current) {
          setError(message);
        }
        throw err;
      }
    },
    [],
  );

  const refresh = useCallback(
    async (userId: string): Promise<void> => {
      await list(userId);
    },
    [list],
  );

  const clearError = useCallback(() => {
    if (isMountedRef.current) {
      setError(null);
    }
  }, []);

  return {
    workflows,
    activeExecutions,
    isLoading,
    isExecuting,
    error,
    list,
    get,
    create,
    update,
    remove,
    execute,
    pause,
    resume,
    cancel,
    getStatus,
    getLogs,
    schedule,
    refresh,
    clearError,
  };
}
