import { invoke, listen, UnlistenFn } from '../lib/tauri-mock';
import { useEffect, useRef } from 'react';
import { sha256 } from '../lib/hash';
import { isTauri } from '../lib/tauri-mock';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  ActionLogStatus,
  AgentStatus,
  ApprovalRequest,
  ApprovalScope,
  BackgroundTask,
  FileOperation,
  PlanStep,
  Screenshot,
  TerminalCommand,
  ToolExecution,
} from '../stores/unifiedChatStore';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type {
  McpToolExecutionStartedPayload,
  McpToolExecutionCompletedPayload,
  McpConnectionChangedPayload,
} from '../types/mcp';
import type {
  ToolStreamEventPayload,
  ToolStreamStartedEvent,
  ToolStreamProgressEvent,
  ToolStreamOutputChunkEvent,
  ToolStreamCompletedEvent,
  ToolStreamErrorEvent,
  ToolStreamCancelledEvent,
} from '../types/toolCalling';

export interface FileOperationEvent {
  operation: FileOperation;
  messageId?: string;
}

export interface TerminalCommandEvent {
  command: TerminalCommand;
  messageId?: string;
}

export interface ToolExecutionEvent {
  execution: ToolExecution;
  messageId?: string;
}

export interface ScreenshotEvent {
  screenshot: Screenshot;
  messageId?: string;
}

export interface AgentStatusEvent {
  agent: AgentStatus;
}

export interface AgentSpawnedEvent {
  agent_id: string;
  goal?: string;
}

export interface BackgroundTaskEvent {
  task: BackgroundTask;
}

export interface ApprovalRequestEvent {
  approval: ApprovalRequest;
  messageId?: string;
}

export interface GoalProgressEvent {
  goalId: string;
  progress: number;
  currentStep?: string;
}

export interface StepCompletedEvent {
  stepId: string;
  goalId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface GoalCompletedEvent {
  goalId: string;
  success: boolean;
  result?: string;
  error?: string;
}

export interface AgentPlanUpdateEvent {
  plan: {
    id: string;
    description: string;
    workflowHash?: string;
    steps: Array<{
      id: string;
      title: string;
      description?: string;
      status?: string;
      parentId?: string;
      result?: string;
    }>;
    createdAt?: number | string;
  };
}

export interface AgentActionUpdateEvent {
  action: {
    id: string;
    workflowHash?: string;
    type?: string;
    title?: string;
    description?: string;
    status?: string;
    requiresApproval?: boolean;
    scope?: ApprovalScope;
    metadata?: Record<string, unknown>;
    result?: string;
    error?: string;
    actionId?: string;
  };
}

export interface AgentPermissionRequiredEvent {
  actionId: string;
  workflowHash?: string;
  reason?: string;
  title?: string;
  scope: ApprovalScope;
  riskLevel?: 'low' | 'medium' | 'high';
  actionSignature?: string;
  type?: string;
}

export interface AgentMetricsEvent {
  metrics: {
    workflowHash?: string;
    actionId?: string;
    tokens?: number;
    costUsd?: number;
    durationMs?: number;
    completionReason?: string;
  };
}

export function useAgenticEvents() {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isMountedRef = useRef(false);
  const setupInProgressRef = useRef(false);
  // AUDIT-007-001 fix: Track tool stream cleanup timeouts for proper cleanup on unmount
  const toolStreamCleanupTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const handlersRef = useRef({
    addFileOperation: useUnifiedChatStore.getState().addFileOperation,
    addTerminalCommand: useUnifiedChatStore.getState().addTerminalCommand,
    addToolExecution: useUnifiedChatStore.getState().addToolExecution,
    addScreenshot: useUnifiedChatStore.getState().addScreenshot,
    addActionLogEntry: useUnifiedChatStore.getState().addActionLogEntry,
    updateActionLogEntry: useUnifiedChatStore.getState().updateActionLogEntry,
    updateAgentStatus: useUnifiedChatStore.getState().updateAgentStatus,
    addAgent: useUnifiedChatStore.getState().addAgent,
    updateBackgroundTask: useUnifiedChatStore.getState().updateBackgroundTask,
    addBackgroundTask: useUnifiedChatStore.getState().addBackgroundTask,
    addApprovalRequest: useUnifiedChatStore.getState().addApprovalRequest,
    approveOperation: useUnifiedChatStore.getState().approveOperation,
    rejectOperation: useUnifiedChatStore.getState().rejectOperation,
    setPlan: useUnifiedChatStore.getState().setPlan,
    updatePlanStep: useUnifiedChatStore.getState().updatePlanStep,
    setWorkflowContext: useUnifiedChatStore.getState().setWorkflowContext,
    setSidecarSectionFromEvent: useUnifiedChatStore.getState().setSidecarSectionFromEvent,
    // Tool streaming handlers
    updateToolStream: useUnifiedChatStore.getState().updateToolStream,
    removeToolStream: useUnifiedChatStore.getState().removeToolStream,
  });

  const normalizeActionStatus = (status?: string): ActionLogStatus => {
    if (!status) return 'pending';
    const normalized = status.toLowerCase();
    if (normalized === 'running' || normalized === 'in_progress') return 'running';
    if (normalized === 'success' || normalized === 'completed' || normalized === 'done')
      return 'success';
    if (normalized === 'failed' || normalized === 'error') return 'failed';
    if (normalized === 'blocked') return 'blocked';
    return 'pending';
  };

  const mapActionType = (type?: string): ActionLogEntryType => {
    switch ((type ?? '').toLowerCase()) {
      case 'filesystem':
      case 'file':
        return 'filesystem';
      case 'browser':
        return 'browser';
      case 'ui':
      case 'desktop':
        return 'ui';
      case 'mcp':
        return 'mcp';
      case 'approval':
        return 'approval';
      case 'metrics':
        return 'metrics';
      case 'plan':
        return 'plan';
      default:
        return 'terminal';
    }
  };

  const upsertActionLogEntry = (
    entry: Partial<ActionLogEntry> & { id?: string; actionId?: string; type?: ActionLogEntryType },
  ) => {
    const entryId = entry.id ?? entry.actionId;
    if (!entryId) return;

    const state = useUnifiedChatStore.getState();
    const existing = state.actionLog.find(
      (log) => log.id === entryId || (!!entry.actionId && log.actionId === entry.actionId),
    );

    if (!existing) {
      handlersRef.current.addActionLogEntry({
        id: entryId,
        actionId: entry.actionId,
        workflowHash: entry.workflowHash,
        type: entry.type ?? 'terminal',
        title: entry.title ?? entry.description ?? 'Agent action',
        description: entry.description,
        status: entry.status ?? 'pending',
        requiresApproval: entry.requiresApproval,
        scope: entry.scope,
        metadata: entry.metadata,
        result: entry.result,
        error: entry.error,
      });
      return;
    }

    handlersRef.current.updateActionLogEntry(existing.id, {
      workflowHash: entry.workflowHash ?? existing.workflowHash,
      status: entry.status ?? existing.status,
      title: entry.title ?? existing.title,
      description: entry.description ?? existing.description,
      requiresApproval: entry.requiresApproval ?? existing.requiresApproval,
      scope: entry.scope ?? existing.scope,
      metadata: entry.metadata ?? existing.metadata,
      result: entry.result ?? existing.result,
      error: entry.error ?? existing.error,
      type: entry.type ?? existing.type,
    });
  };

  const focusSidecar = (eventType: string) => {
    handlersRef.current.setSidecarSectionFromEvent(eventType);
  };

  /**
   * Safely wraps an event handler with error handling to prevent crashes
   * and ensure component stability when processing Tauri events.
   */
  const safeHandler = <T>(eventName: string, handler: (payload: T) => void | Promise<void>) => {
    return async (event: { payload: T }) => {
      if (!isMountedRef.current) return;
      try {
        await handler(event.payload);
      } catch (error) {
        console.error(`[useAgenticEvents] Error in ${eventName} handler:`, error);
      }
    };
  };

  useEffect(() => {
    const unsubscribe = useUnifiedChatStore.subscribe((state) => {
      handlersRef.current = {
        addFileOperation: state.addFileOperation,
        addTerminalCommand: state.addTerminalCommand,
        addToolExecution: state.addToolExecution,
        addScreenshot: state.addScreenshot,
        addActionLogEntry: state.addActionLogEntry,
        updateActionLogEntry: state.updateActionLogEntry,
        updateAgentStatus: state.updateAgentStatus,
        addAgent: state.addAgent,
        updateBackgroundTask: state.updateBackgroundTask,
        addBackgroundTask: state.addBackgroundTask,
        addApprovalRequest: state.addApprovalRequest,
        approveOperation: state.approveOperation,
        rejectOperation: state.rejectOperation,
        setPlan: state.setPlan,
        updatePlanStep: state.updatePlanStep,
        setWorkflowContext: state.setWorkflowContext,
        setSidecarSectionFromEvent: state.setSidecarSectionFromEvent,
        // Tool streaming handlers
        updateToolStream: state.updateToolStream,
        removeToolStream: state.removeToolStream,
      };
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (setupInProgressRef.current) {
      console.warn('[useAgenticEvents] Setup already in progress, cleaning up old listeners');
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    }

    setupInProgressRef.current = true;

    const setupListeners = async () => {
      if (!isMountedRef.current) {
        setupInProgressRef.current = false;
        return;
      }

      const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);

      const unlistenFileOp = await listen<FileOperationEvent>(
        'agi:file_operation',
        safeHandler('agi:file_operation', (payload) => {
          handlersRef.current.addFileOperation(payload.operation);
          focusSidecar(`file_${payload.operation.type ?? 'file'}`);
        }),
      );
      push(unlistenFileOp);

      const unlistenTerminal = await listen<TerminalCommandEvent>(
        'agi:terminal_command',
        safeHandler('agi:terminal_command', (payload) => {
          handlersRef.current.addTerminalCommand(payload.command);
          focusSidecar('terminal_execute');
        }),
      );
      push(unlistenTerminal);

      const unlistenToolExec = await listen<ToolExecutionEvent>(
        'agi:tool_execution',
        safeHandler('agi:tool_execution', (payload) => {
          handlersRef.current.addToolExecution(payload.execution);
          // Extract tool name from various possible field names in the execution payload
          const exec = payload.execution as ToolExecution & {
            tool?: string;
            name?: string;
            type?: string;
          };
          const tool = exec.toolName ?? exec.tool ?? exec.name ?? exec.type ?? '';
          focusSidecar(tool || 'tool');
        }),
      );
      push(unlistenToolExec);

      const unlistenScreenshot = await listen<ScreenshotEvent>(
        'agi:screenshot',
        safeHandler('agi:screenshot', (payload) => {
          handlersRef.current.addScreenshot(payload.screenshot);
        }),
      );
      push(unlistenScreenshot);

      const unlistenPlanUpdate = await listen<AgentPlanUpdateEvent>(
        'agent:plan_update',
        async (event) => {
          try {
            if (!isMountedRef.current) return;
            if (!event.payload?.plan) return;

            const { plan } = event.payload;
            const normalizedSteps =
              plan.steps?.map<PlanStep>((step) => ({
                id: step.id,
                title: step.title,
                description: step.description,
                status: normalizeActionStatus(step.status),
                parentId: step.parentId,
                result: step.result,
              })) ?? [];

            handlersRef.current.setPlan({
              id: plan.id,
              description: plan.description,
              steps: normalizedSteps,
              createdAt: plan.createdAt ? new Date(plan.createdAt) : new Date(),
              updatedAt: new Date(),
            });

            const currentContext = useUnifiedChatStore.getState().workflowContext;
            const entryPoint =
              currentContext?.entryPoint ?? currentContext?.description ?? plan.description;
            let workflowHash = plan.workflowHash;

            if (!workflowHash && entryPoint) {
              try {
                const composite = `${entryPoint}::${plan.description}`;
                workflowHash = await sha256(composite);
              } catch (hashError) {
                console.error('[useAgenticEvents] Failed to compute workflow hash', hashError);
              }
            }

            if (workflowHash && entryPoint) {
              handlersRef.current.setWorkflowContext({
                hash: workflowHash,
                description: plan.description,
                entryPoint,
              });
              if (isTauri) {
                // AUDIT-007-002 fix: Store timeout ID and clear in finally block to prevent timer leak
                let timeoutId: ReturnType<typeof setTimeout> | undefined;
                try {
                  const INVOKE_TIMEOUT_MS = 10000;
                  await Promise.race([
                    invoke('agent_set_workflow_hash', { workflow_hash: workflowHash }),
                    new Promise<never>((_, reject) => {
                      timeoutId = setTimeout(
                        () =>
                          reject(
                            new Error(
                              'Timeout: agent_set_workflow_hash did not respond within 10 seconds',
                            ),
                          ),
                        INVOKE_TIMEOUT_MS,
                      );
                    }),
                  ]);
                } catch (error) {
                  console.error('[useAgenticEvents] Failed to push workflow hash', error);
                } finally {
                  if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                  }
                }
              }
            } else if (workflowHash && !entryPoint) {
              console.warn(
                '[useAgenticEvents] Missing entryPoint for workflow context, skipping setWorkflowContext',
              );
            }

            upsertActionLogEntry({
              id: plan.id,
              type: 'plan',
              title: 'Plan generated',
              description: plan.description,
              status: 'success',
              workflowHash,
            });
          } catch (error) {
            console.error('[useAgenticEvents] Error in agent:plan_update handler', error);
          }
        },
      ).catch((error) => {
        console.error('[useAgenticEvents] Failed to setup agent:plan_update listener', error);
        return () => {};
      });
      push(unlistenPlanUpdate);

      const unlistenActionUpdate = await listen<AgentActionUpdateEvent>(
        'agent:action_update',
        (event) => {
          if (!isMountedRef.current) return;
          if (!event.payload?.action) return;
          const payload = event.payload.action;
          if (payload.type) {
            focusSidecar(payload.type);
          }
          upsertActionLogEntry({
            id: payload.id ?? payload.actionId,
            actionId: payload.actionId ?? payload.id,
            workflowHash: payload.workflowHash,
            type: mapActionType(payload.type),
            title: payload.title,
            description: payload.description,
            status: normalizeActionStatus(payload.status),
            requiresApproval: payload.requiresApproval,
            scope: payload.scope,
            metadata: payload.metadata,
            result: payload.result,
            error: payload.error,
          });
        },
      );
      push(unlistenActionUpdate);

      const unlistenPermissionRequired = await listen<AgentPermissionRequiredEvent>(
        'agent:permission_required',
        (event) => {
          if (!isMountedRef.current) return;
          if (!event.payload) return;
          const payload = event.payload;

          handlersRef.current.addApprovalRequest({
            id: payload.actionId,
            type: (payload.type as ApprovalRequest['type']) ?? 'terminal_command',
            description: payload.reason ?? 'Action requires approval',
            riskLevel: payload.riskLevel ?? payload.scope.risk ?? 'high',
            details: {
              scope: payload.scope,
            },
            scope: payload.scope,
            workflowHash: payload.workflowHash,
            actionId: payload.actionId,
            actionSignature: payload.actionSignature,
          });

          upsertActionLogEntry({
            id: payload.actionId,
            type: mapActionType(payload.type),
            title: payload.title ?? 'Approval required',
            description: payload.reason,
            status: 'blocked',
            workflowHash: payload.workflowHash,
            requiresApproval: true,
            scope: payload.scope,
          });
        },
      );
      push(unlistenPermissionRequired);

      const unlistenMetrics = await listen<AgentMetricsEvent>('agent:metrics', (event) => {
        if (!isMountedRef.current) return;
        if (!event.payload?.metrics) return;
        const payload = event.payload.metrics;
        upsertActionLogEntry({
          id: payload.actionId ?? `metrics-${payload.workflowHash ?? crypto.randomUUID()}`,
          type: 'metrics',
          title: 'Task metrics',
          description: `Tokens: ${payload.tokens ?? 0}, Cost: $${(payload.costUsd ?? 0).toFixed(4)}`,
          status: 'success',
          workflowHash: payload.workflowHash,
          metadata: payload,
        });
      });
      push(unlistenMetrics);

      const unlistenAgentStatus = await listen<AgentStatusEvent>('agent:status_update', (event) => {
        if (!isMountedRef.current) return;
        const existingAgents = useUnifiedChatStore.getState().agents ?? [];
        const agentExists = existingAgents.some((a) => a.id === event.payload.agent.id);

        if (agentExists) {
          handlersRef.current.updateAgentStatus(event.payload.agent.id, event.payload.agent);
        } else {
          handlersRef.current.addAgent(event.payload.agent);
        }
      });
      push(unlistenAgentStatus);

      const unlistenAgentSpawned = await listen<AgentSpawnedEvent>('agent:spawned', (event) => {
        if (!isMountedRef.current) return;
        const payload = event.payload;
        if (!payload?.agent_id) return;
        handlersRef.current.addAgent({
          id: payload.agent_id,
          name: payload.goal ? `Agent - ${payload.goal}` : payload.agent_id,
          status: 'idle',
          currentGoal: payload.goal,
          progress: 0,
          startedAt: new Date(),
        });
      });
      push(unlistenAgentSpawned);

      interface AgentActionPayload {
        type?: string;
        tool?: string;
        tool_name?: string;
        name?: string;
      }
      const unlistenAgentAction = await listen<AgentActionPayload>('agent:action', (event) => {
        if (!isMountedRef.current) return;
        const payload = event.payload;
        const actionType =
          payload?.type || payload?.tool || payload?.tool_name || payload?.name || 'action';
        focusSidecar(String(actionType));
      });
      push(unlistenAgentAction);

      const unlistenTaskProgress = await listen<BackgroundTaskEvent>('task:progress', (event) => {
        if (!isMountedRef.current) return;
        const existingTasks = useUnifiedChatStore.getState().backgroundTasks;
        const taskExists = existingTasks.some((t) => t.id === event.payload.task.id);

        if (taskExists) {
          handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
        } else {
          handlersRef.current.addBackgroundTask(event.payload.task);
        }
      });
      push(unlistenTaskProgress);

      const unlistenTaskCompleted = await listen<BackgroundTaskEvent>('task:completed', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      push(unlistenTaskCompleted);

      const unlistenTaskFailed = await listen<BackgroundTaskEvent>('task:failed', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      push(unlistenTaskFailed);

      const unlistenApprovalRequired = await listen<ApprovalRequestEvent>(
        'agi:approval_required',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.addApprovalRequest(event.payload.approval);
        },
      );
      push(unlistenApprovalRequired);

      interface ToolConfirmationSummary {
        request_id: string;
        tool_name: string;
        tool_display_name: string;
        description: string;
        parameters_summary: string;
        risk_level: string;
        safety_tier: string;
        reason: string;
        reversible: boolean;
        undo_description?: string;
      }

      const unlistenToolConfirmation = await listen<ToolConfirmationSummary>(
        'tool:confirmation_required',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;

          handlersRef.current.addApprovalRequest({
            id: payload.request_id,
            type: 'mcp_tool',
            description: payload.description,
            riskLevel: (payload.risk_level.toLowerCase() as 'low' | 'medium' | 'high') || 'high',
            details: {
              tool: payload.tool_display_name,
              toolName: payload.tool_name,
              parameters: payload.parameters_summary,
              reason: payload.reason,
              reversible: payload.reversible,
              safetyTier: payload.safety_tier,
            },
            timeoutSeconds: 120, // Match backend timeout
          });

          focusSidecar('approval');
        },
      );
      push(unlistenToolConfirmation);

      const unlistenToolTimeout = await listen<{ request_id: string }>(
        'tool:confirmation_timeout',
        (event) => {
          if (!isMountedRef.current) return;
          const { request_id } = event.payload;
          handlersRef.current.rejectOperation(request_id, 'Operation timed out');
        },
      );
      push(unlistenToolTimeout);

      interface ApprovalRequestPayload {
        id: string;
        type?: string;
        description?: string;
        riskLevel?: 'low' | 'medium' | 'high';
        details?: Record<string, unknown>;
        impact?: string;
      }
      const unlistenApprovalRequest = await listen<ApprovalRequestPayload>(
        'approval:request',
        (event) => {
          if (!isMountedRef.current) return;
          const approvalType = (event.payload.type ||
            'terminal_command') as ApprovalRequest['type'];
          const approval: Omit<ApprovalRequest, 'status' | 'createdAt'> = {
            id: event.payload.id,
            type: approvalType,
            description: event.payload.description || 'Agent operation requires approval',
            riskLevel: (event.payload.riskLevel || 'high') as 'low' | 'medium' | 'high',
            details: event.payload.details || {},
            impact: event.payload.impact,
          };
          handlersRef.current.addApprovalRequest(approval);
        },
      );
      push(unlistenApprovalRequest);

      const unlistenApprovalGranted = await listen<ApprovalRequestEvent>(
        'agi:approval_granted',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.approveOperation(event.payload.approval.id);
        },
      );
      push(unlistenApprovalGranted);

      const unlistenApprovalDenied = await listen<ApprovalRequestEvent>(
        'agi:approval_denied',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.rejectOperation(
            event.payload.approval.id,
            event.payload.approval.rejectionReason,
          );
        },
      );
      push(unlistenApprovalDenied);

      const unlistenGoalProgress = await listen<GoalProgressEvent>('agi:goal_progress', (event) => {
        if (!isMountedRef.current) return;
        const { goalId, progress, currentStep } = event.payload;

        // Update agent status with progress
        const state = useUnifiedChatStore.getState();
        const existingAgent = state.agents.find((a) => a.currentGoal === goalId || a.id === goalId);

        if (existingAgent) {
          handlersRef.current.updateAgentStatus(existingAgent.id, {
            progress,
            currentStep,
            status: 'running',
          });
        }

        // Update action trail with progress
        const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
        addActionTrailEntry?.({
          type: 'running',
          message: currentStep || `Progress: ${Math.round(progress * 100)}%`,
          progress: progress * 100,
          fadeAfter: 10000,
        });
      });
      push(unlistenGoalProgress);

      const unlistenStepCompleted = await listen<StepCompletedEvent>(
        'agi:step_completed',
        (event) => {
          if (!isMountedRef.current) return;
          const { stepId, success, output, error } = event.payload;

          // Update plan step if it exists
          handlersRef.current.updatePlanStep(stepId, {
            status: success ? 'success' : 'failed',
            result: output || error,
          });

          // Update action log entry
          upsertActionLogEntry({
            id: stepId,
            actionId: stepId,
            type: 'terminal',
            title: success ? 'Step completed' : 'Step failed',
            description: output || error,
            status: success ? 'success' : 'failed',
            workflowHash: undefined,
          });

          // Update action trail
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: success ? 'completed' : 'error',
            message: success ? output || 'Step completed' : error || 'Step failed',
            fadeAfter: 5000,
          });
        },
      );
      push(unlistenStepCompleted);

      const unlistenGoalCompleted = await listen<GoalCompletedEvent>(
        'agi:goal_completed',
        (event) => {
          if (!isMountedRef.current) return;
          const { goalId, success, result, error } = event.payload;

          // Update agent status to completed
          const state = useUnifiedChatStore.getState();
          const existingAgent = state.agents.find(
            (a) => a.currentGoal === goalId || a.id === goalId,
          );

          if (existingAgent) {
            handlersRef.current.updateAgentStatus(existingAgent.id, {
              status: success ? 'completed' : 'failed',
              progress: success ? 100 : existingAgent.progress,
              completedAt: new Date(),
              error: error,
            });
          }

          // Clear current agent status if this was the active one
          const currentAgentStatus = state.agentStatus;
          if (
            currentAgentStatus &&
            (currentAgentStatus.currentGoal === goalId || currentAgentStatus.id === goalId)
          ) {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgentStatus,
              status: success ? 'completed' : 'failed',
              progress: success ? 100 : currentAgentStatus.progress,
              completedAt: new Date(),
              error: error,
            });
          }

          // Update action trail with completion
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: success ? 'completed' : 'error',
            message: success ? result || 'Goal completed successfully' : error || 'Goal failed',
            fadeAfter: 10000,
          });

          // Log completion in action log
          upsertActionLogEntry({
            id: `goal-${goalId}-complete`,
            type: 'terminal',
            title: success ? 'Goal completed' : 'Goal failed',
            description: result || error,
            status: success ? 'success' : 'failed',
          });
        },
      );
      push(unlistenGoalCompleted);

      // MCP Tool Execution Events - show tool usage in action trail
      const unlistenMcpToolStarted = await listen<McpToolExecutionStartedPayload>(
        'mcp:tool_execution_started',
        (event) => {
          if (!isMountedRef.current) return;
          const { tool_id, server_name } = event.payload;
          // Extract readable tool name from tool_id (format: mcp_server_toolname)
          const toolName = tool_id.replace(/^mcp_[^_]+_/, '').replace(/_/g, ' ');

          upsertActionLogEntry({
            id: `mcp-${tool_id}-${Date.now()}`,
            actionId: tool_id,
            type: 'mcp',
            title: `Using ${toolName}`,
            description: `Executing MCP tool from ${server_name}`,
            status: 'running',
            metadata: { tool_id, server_name },
          });

          // Also add to action trail for real-time visibility
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: 'running',
            message: `Using ${toolName}...`,
          });

          focusSidecar('mcp');
        },
      );
      push(unlistenMcpToolStarted);

      const unlistenMcpToolCompleted = await listen<McpToolExecutionCompletedPayload>(
        'mcp:tool_execution_completed',
        (event) => {
          if (!isMountedRef.current) return;
          const { tool_id, success, duration_ms } = event.payload;
          const toolName = tool_id.replace(/^mcp_[^_]+_/, '').replace(/_/g, ' ');

          // Find and update the existing entry
          const state = useUnifiedChatStore.getState();
          const existingEntry = state.actionLog.find(
            (log) => log.actionId === tool_id && log.status === 'running',
          );

          if (existingEntry) {
            handlersRef.current.updateActionLogEntry(existingEntry.id, {
              status: success ? 'success' : 'failed',
              description: success
                ? `Completed in ${duration_ms}ms`
                : `Failed after ${duration_ms}ms`,
              metadata: { ...existingEntry.metadata, duration_ms, success },
            });
          }

          // Update action trail
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: success ? 'completed' : 'error',
            message: success ? `${toolName} completed (${duration_ms}ms)` : `${toolName} failed`,
          });
        },
      );
      push(unlistenMcpToolCompleted);

      const unlistenMcpConnection = await listen<McpConnectionChangedPayload>(
        'mcp:connection_changed',
        (event) => {
          if (!isMountedRef.current) return;
          const { server_name, connected, error } = event.payload;

          upsertActionLogEntry({
            id: `mcp-conn-${server_name}-${Date.now()}`,
            type: 'mcp',
            title: connected ? `Connected to ${server_name}` : `Disconnected from ${server_name}`,
            description: error ?? (connected ? 'MCP server connected' : 'MCP server disconnected'),
            status: connected ? 'success' : error ? 'failed' : 'success',
            metadata: { server_name, connected, error },
          });
        },
      );
      push(unlistenMcpConnection);

      // Tool Stream Events - real-time progress for tool executions
      const unlistenToolStream = await listen<ToolStreamEventPayload>(
        'agi:tool_stream',
        (event) => {
          if (!isMountedRef.current) return;
          const { event: streamEvent, timestamp } = event.payload;

          switch (streamEvent.type) {
            case 'started': {
              const startedEvent = streamEvent as ToolStreamStartedEvent;
              handlersRef.current.updateToolStream(startedEvent.tool_id, {
                tool_id: startedEvent.tool_id,
                tool_name: startedEvent.tool_name,
                status: 'running',
                progress: 0,
                startedAt: new Date(timestamp),
                parameters: startedEvent.parameters as Record<string, unknown>,
              });

              // Also update action trail for visibility
              const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
              addActionTrailEntry?.({
                type: 'running',
                message: `Executing ${startedEvent.tool_name}...`,
              });
              break;
            }

            case 'progress': {
              const progressEvent = streamEvent as ToolStreamProgressEvent;
              handlersRef.current.updateToolStream(progressEvent.tool_id, {
                progress: progressEvent.progress,
                progressMessage: progressEvent.message,
                bytesProcessed: progressEvent.bytes_processed,
                bytesTotal: progressEvent.bytes_total,
              });
              break;
            }

            case 'output_chunk': {
              const chunkEvent = streamEvent as ToolStreamOutputChunkEvent;
              handlersRef.current.updateToolStream(chunkEvent.tool_id, {
                outputBuffer: chunkEvent.chunk,
                outputChunks: [chunkEvent.chunk],
              });
              break;
            }

            case 'completed': {
              const completedEvent = streamEvent as ToolStreamCompletedEvent;
              handlersRef.current.updateToolStream(completedEvent.tool_id, {
                status: 'completed',
                progress: 1.0,
                result: completedEvent.result,
                completedAt: new Date(timestamp),
                duration_ms: completedEvent.duration_ms,
              });

              // Update action trail
              const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
              const state = useUnifiedChatStore.getState();
              const stream = state.activeToolStreams.get(completedEvent.tool_id);
              addActionTrailEntry?.({
                type: 'completed',
                message: `${stream?.tool_name || 'Tool'} completed (${completedEvent.duration_ms}ms)`,
              });

              // AUDIT-007-001 fix: Store timeout ID for cleanup on unmount
              const existingTimeout = toolStreamCleanupTimeoutsRef.current.get(
                completedEvent.tool_id,
              );
              if (existingTimeout) {
                clearTimeout(existingTimeout);
              }
              const timeoutId = setTimeout(() => {
                if (isMountedRef.current) {
                  handlersRef.current.removeToolStream(completedEvent.tool_id);
                }
                toolStreamCleanupTimeoutsRef.current.delete(completedEvent.tool_id);
              }, 5000);
              toolStreamCleanupTimeoutsRef.current.set(completedEvent.tool_id, timeoutId);
              break;
            }

            case 'error': {
              const errorEvent = streamEvent as ToolStreamErrorEvent;
              handlersRef.current.updateToolStream(errorEvent.tool_id, {
                status: 'error',
                error: errorEvent.error,
                completedAt: new Date(timestamp),
                duration_ms: errorEvent.duration_ms,
                retryable: errorEvent.retryable,
              });

              // Update action trail
              const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
              const state = useUnifiedChatStore.getState();
              const stream = state.activeToolStreams.get(errorEvent.tool_id);
              addActionTrailEntry?.({
                type: 'error',
                message: `${stream?.tool_name || 'Tool'} failed: ${errorEvent.error}`,
              });
              break;
            }

            case 'cancelled': {
              const cancelledEvent = streamEvent as ToolStreamCancelledEvent;
              handlersRef.current.updateToolStream(cancelledEvent.tool_id, {
                status: 'cancelled',
                error: cancelledEvent.reason,
                completedAt: new Date(timestamp),
                duration_ms: cancelledEvent.duration_ms,
              });
              break;
            }
          }
        },
      );
      push(unlistenToolStream);

      // MCP server health and system events - sync with mcpStore
      try {
        const { useMcpStore } = await import('../stores/mcpStore');

        interface McpServerUnhealthyPayload {
          server_name: string;
          error?: string;
        }
        const unlistenMcpServerUnhealthy = await listen<McpServerUnhealthyPayload>(
          'mcp:server_unhealthy',
          safeHandler('mcp:server_unhealthy', () => {
            // Refresh servers when a server becomes unhealthy
            useMcpStore.getState().refreshServers();
          }),
        );
        push(unlistenMcpServerUnhealthy);

        interface McpToolsUpdatedPayload {
          server_name: string;
          tools_count?: number;
        }
        const unlistenMcpToolsUpdated = await listen<McpToolsUpdatedPayload>(
          'mcp:tools_updated',
          safeHandler('mcp:tools_updated', () => {
            // Refresh tools when tools are updated on any server
            useMcpStore.getState().refreshTools();
          }),
        );
        push(unlistenMcpToolsUpdated);

        interface McpSystemInitializedPayload {
          servers_count?: number;
          tools_count?: number;
        }
        const unlistenMcpSystemInitialized = await listen<McpSystemInitializedPayload>(
          'mcp:system_initialized',
          safeHandler('mcp:system_initialized', () => {
            // When MCP system is initialized, refresh everything
            const mcpState = useMcpStore.getState();
            mcpState.refreshServers();
            mcpState.refreshTools();
            mcpState.refreshStats();
          }),
        );
        push(unlistenMcpSystemInitialized);
      } catch (error) {
        console.error('[useAgenticEvents] Failed to setup MCP listeners:', error);
      }

      setupInProgressRef.current = false;
    };

    setupListeners().catch((error) => {
      console.error('[useAgenticEvents] Failed to setup listeners:', error);
      setupInProgressRef.current = false;
    });

    // AUDIT-007-001 fix: Capture ref values inside effect for cleanup function
    const timeoutsMap = toolStreamCleanupTimeoutsRef.current;

    return () => {
      isMountedRef.current = false;
      setupInProgressRef.current = false;
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
      // AUDIT-007-001 fix: Clear all pending tool stream cleanup timeouts on unmount
      timeoutsMap.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutsMap.clear();
    };
  }, []);

  return null;
}

export default useAgenticEvents;
