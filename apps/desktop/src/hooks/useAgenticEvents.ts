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
      };
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const setupListeners = async () => {
      const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);

      const unlistenFileOp = await listen<FileOperationEvent>('agi:file_operation', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.addFileOperation(event.payload.operation);
        focusSidecar(`file_${event.payload.operation.type ?? 'file'}`);
      });
      push(unlistenFileOp);

      const unlistenTerminal = await listen<TerminalCommandEvent>(
        'agi:terminal_command',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.addTerminalCommand(event.payload.command);
          focusSidecar('terminal_execute');
        },
      );
      push(unlistenTerminal);

      const unlistenToolExec = await listen<ToolExecutionEvent>('agi:tool_execution', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.addToolExecution(event.payload.execution);
        const tool =
          (event.payload.execution as any)?.tool ??
          (event.payload.execution as any)?.name ??
          (event.payload.execution as any)?.type ??
          '';
        focusSidecar(tool || 'tool');
      });
      push(unlistenToolExec);

      const unlistenScreenshot = await listen<ScreenshotEvent>('agi:screenshot', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.addScreenshot(event.payload.screenshot);
      });
      push(unlistenScreenshot);

      const unlistenPlanUpdate = await listen<AgentPlanUpdateEvent>(
        'agent:plan_update',
        async (event) => {
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
            const composite = `${entryPoint}::${plan.description}`;
            workflowHash = await sha256(composite);
          }

          if (workflowHash) {
            handlersRef.current.setWorkflowContext({
              hash: workflowHash,
              description: plan.description,
              entryPoint,
            });
            if (isTauri) {
              try {
                await invoke('agent_set_workflow_hash', { workflow_hash: workflowHash });
              } catch (error) {
                console.error('[useAgenticEvents] Failed to push workflow hash', error);
              }
            }
          }

          upsertActionLogEntry({
            id: plan.id,
            type: 'plan',
            title: 'Plan generated',
            description: plan.description,
            status: 'success',
            workflowHash,
          });
        },
      );
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
        const existingAgents = useUnifiedChatStore.getState().agents;
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

      const unlistenAgentAction = await listen<any>('agent:action', (event) => {
        if (!isMountedRef.current) return;
        const payload = event.payload as any;
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

      const unlistenApprovalRequest = await listen<any>('approval:request', (event) => {
        if (!isMountedRef.current) return;
        const approval = {
          id: event.payload.id,
          type: event.payload.type || 'terminal_command',
          description: event.payload.description || 'Agent operation requires approval',
          riskLevel: (event.payload.riskLevel || 'high') as 'low' | 'medium' | 'high',
          details: event.payload.details || {},
          impact: event.payload.impact,
        };
        handlersRef.current.addApprovalRequest(approval);
      });
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

      const unlistenGoalProgress = await listen<GoalProgressEvent>(
        'agi:goal_progress',
        (_event) => {
          if (!isMountedRef.current) return;
        },
      );
      push(unlistenGoalProgress);

      const unlistenStepCompleted = await listen<StepCompletedEvent>(
        'agi:step_completed',
        (_event) => {
          if (!isMountedRef.current) return;
        },
      );
      push(unlistenStepCompleted);

      const unlistenGoalCompleted = await listen<GoalCompletedEvent>(
        'agi:goal_completed',
        (_event) => {
          if (!isMountedRef.current) return;
        },
      );
      push(unlistenGoalCompleted);
    };

    setupListeners().catch((error) => {
      console.error('[useAgenticEvents] Failed to setup listeners:', error);
    });

    return () => {
      isMountedRef.current = false;
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    };
  }, []);

  return null;
}

export default useAgenticEvents;
