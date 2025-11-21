import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type {
  FileOperation,
  TerminalCommand,
  ToolExecution,
  Screenshot,
  AgentStatus,
  BackgroundTask,
  ApprovalRequest,
  ActionLogEntry,
  PlanStep,
  ApprovalScope,
  ActionLogStatus,
  ActionLogEntryType,
} from '../stores/unifiedChatStore';
import { sha256 } from '../lib/hash';
import { isTauri } from '../lib/tauri-mock';

/**
 * Event payloads emitted from Tauri backend
 */
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

/**
 * Hook to listen to Tauri events and update the unified chat store
 *
 * This hook establishes listeners for all AGI system events and automatically
 * updates the store when operations occur. It handles cleanup on unmount.
 *
 * Updated Nov 16, 2025: Fixed missing dependencies and race conditions
 *
 * @example
 * ```tsx
 * function ChatView() {
 *   useAgenticEvents();
 *   return <UnifiedAgenticChat />;
 * }
 * ```
 */
export function useAgenticEvents() {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isMountedRef = useRef(true);

  // Store handler refs to avoid dependency issues
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
  });

  const normalizeActionStatus = (status?: string): ActionLogStatus => {
    if (!status) {
      return 'pending';
    }
    const normalized = status.toLowerCase();
    if (normalized === 'running' || normalized === 'in_progress') {
      return 'running';
    }
    if (normalized === 'success' || normalized === 'completed' || normalized === 'done') {
      return 'success';
    }
    if (normalized === 'failed' || normalized === 'error') {
      return 'failed';
    }
    if (normalized === 'blocked') {
      return 'blocked';
    }
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
    if (!entryId) {
      return;
    }
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

  // Update handler refs when store changes
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
      };
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const setupListeners = async () => {
      // File Operation Events
      const unlistenFileOp = await listen<FileOperationEvent>('agi:file_operation', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] File operation:', event.payload);
        handlersRef.current.addFileOperation(event.payload.operation);
      });
      unlistenFns.current.push(unlistenFileOp);

      // Terminal Command Events
      const unlistenTerminal = await listen<TerminalCommandEvent>(
        'agi:terminal_command',
        (event) => {
          if (!isMountedRef.current) return;
          console.log('[useAgenticEvents] Terminal command:', event.payload);
          handlersRef.current.addTerminalCommand(event.payload.command);
        },
      );
      unlistenFns.current.push(unlistenTerminal);

      // Tool Execution Events
      const unlistenToolExec = await listen<ToolExecutionEvent>('agi:tool_execution', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Tool execution:', event.payload);
        handlersRef.current.addToolExecution(event.payload.execution);
      });
      unlistenFns.current.push(unlistenToolExec);

      // Screenshot Events
      const unlistenScreenshot = await listen<ScreenshotEvent>('agi:screenshot', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Screenshot:', event.payload);
        handlersRef.current.addScreenshot(event.payload.screenshot);
      });
      unlistenFns.current.push(unlistenScreenshot);

      const unlistenPlanUpdate = await listen<AgentPlanUpdateEvent>(
        'agent:plan_update',
        (event) => {
          if (!isMountedRef.current) return;
          if (!event.payload?.plan) return;
          void (async () => {
            console.log('[useAgenticEvents] Plan update:', event.payload);
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
          })();
        },
      );
      unlistenFns.current.push(unlistenPlanUpdate);

      const unlistenActionUpdate = await listen<AgentActionUpdateEvent>(
        'agent:action_update',
        (event) => {
          if (!isMountedRef.current) return;
          if (!event.payload?.action) return;
          const payload = event.payload.action;
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
      unlistenFns.current.push(unlistenActionUpdate);

      const unlistenPermissionRequired = await listen<AgentPermissionRequiredEvent>(
        'agent:permission_required',
        (event) => {
          if (!isMountedRef.current) return;
          if (!event.payload) return;
          const payload = event.payload;
          console.log('[useAgenticEvents] Permission required:', payload);
          const riskyScope =
            payload.scope?.type === 'filesystem' || payload.scope?.type === 'browser';
          const highRisk = (payload.riskLevel ?? payload.scope?.risk ?? 'high') === 'high';
          if (riskyScope && highRisk) {
            const summary =
              payload.reason ||
              payload.title ||
              `Agent requested ${payload.scope?.type ?? 'privileged'} action`;
            const confirm = window.confirm(
              `High-risk ${payload.scope?.type ?? 'action'}:\n${summary}\nDo you want to queue this for approval?`,
            );
            if (!confirm) {
              handlersRef.current.rejectOperation(payload.actionId, 'Blocked by user preflight');
              upsertActionLogEntry({
                id: payload.actionId,
                type: mapActionType(payload.type),
                title: payload.title ?? 'Blocked action',
                description: summary,
                status: 'failed',
                workflowHash: payload.workflowHash,
                requiresApproval: true,
                scope: payload.scope,
              });
              return;
            }
          }
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
      unlistenFns.current.push(unlistenPermissionRequired);

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
      unlistenFns.current.push(unlistenMetrics);

      // Agent Status Events
      const unlistenAgentStatus = await listen<AgentStatusEvent>('agent:status_update', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Agent status update:', event.payload);
        const existingAgents = useUnifiedChatStore.getState().agents;
        const agentExists = existingAgents.some((a) => a.id === event.payload.agent.id);

        if (agentExists) {
          handlersRef.current.updateAgentStatus(event.payload.agent.id, event.payload.agent);
        } else {
          handlersRef.current.addAgent(event.payload.agent);
        }
      });
      unlistenFns.current.push(unlistenAgentStatus);

      const unlistenAgentSpawned = await listen<AgentSpawnedEvent>('agent:spawned', (event) => {
        if (!isMountedRef.current) return;
        const payload = event.payload;
        if (!payload?.agent_id) return;
        console.log('[useAgenticEvents] Agent spawned:', payload);
        handlersRef.current.addAgent({
          id: payload.agent_id,
          name: payload.goal ? `Agent • ${payload.goal}` : payload.agent_id,
          status: 'idle',
          currentGoal: payload.goal,
          progress: 0,
          startedAt: new Date(),
        });
      });
      unlistenFns.current.push(unlistenAgentSpawned);

      // Background Task Events
      const unlistenTaskProgress = await listen<BackgroundTaskEvent>('task:progress', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Task progress:', event.payload);
        const existingTasks = useUnifiedChatStore.getState().backgroundTasks;
        const taskExists = existingTasks.some((t) => t.id === event.payload.task.id);

        if (taskExists) {
          handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
        } else {
          handlersRef.current.addBackgroundTask(event.payload.task);
        }
      });
      unlistenFns.current.push(unlistenTaskProgress);

      const unlistenTaskCompleted = await listen<BackgroundTaskEvent>('task:completed', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Task completed:', event.payload);
        handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      unlistenFns.current.push(unlistenTaskCompleted);

      const unlistenTaskFailed = await listen<BackgroundTaskEvent>('task:failed', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Task failed:', event.payload);
        handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      unlistenFns.current.push(unlistenTaskFailed);

      // Approval Request Events
      const unlistenApprovalRequired = await listen<ApprovalRequestEvent>(
        'agi:approval_required',
        (event) => {
          if (!isMountedRef.current) return;
          console.log('[useAgenticEvents] Approval required:', event.payload);
          handlersRef.current.addApprovalRequest(event.payload.approval);
        },
      );
      unlistenFns.current.push(unlistenApprovalRequired);

      // Listen for approval:request events from tool_executor.rs
      const unlistenApprovalRequest = await listen<any>('approval:request', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Approval request:', event.payload);
        // Map the payload to ApprovalRequest format
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
      unlistenFns.current.push(unlistenApprovalRequest);

      const unlistenApprovalGranted = await listen<ApprovalRequestEvent>(
        'agi:approval_granted',
        (event) => {
          if (!isMountedRef.current) return;
          console.log('[useAgenticEvents] Approval granted:', event.payload);
          handlersRef.current.approveOperation(event.payload.approval.id);
        },
      );
      unlistenFns.current.push(unlistenApprovalGranted);

      const unlistenApprovalDenied = await listen<ApprovalRequestEvent>(
        'agi:approval_denied',
        (event) => {
          if (!isMountedRef.current) return;
          console.log('[useAgenticEvents] Approval denied:', event.payload);
          handlersRef.current.rejectOperation(
            event.payload.approval.id,
            event.payload.approval.rejectionReason,
          );
        },
      );
      unlistenFns.current.push(unlistenApprovalDenied);

      // Goal Progress Events (for future use)
      const unlistenGoalProgress = await listen<GoalProgressEvent>('agi:goal_progress', (event) => {
        if (!isMountedRef.current) return;
        console.log('[useAgenticEvents] Goal progress:', event.payload);
        // Future: update goal progress in store
      });
      unlistenFns.current.push(unlistenGoalProgress);

      const unlistenStepCompleted = await listen<StepCompletedEvent>(
        'agi:step_completed',
        (event) => {
          if (!isMountedRef.current) return;
          console.log('[useAgenticEvents] Step completed:', event.payload);
          // Future: update step status in store
        },
      );
      unlistenFns.current.push(unlistenStepCompleted);

      const unlistenGoalCompleted = await listen<GoalCompletedEvent>(
        'agi:goal_completed',
        (event) => {
          if (!isMountedRef.current) return;
          console.log('[useAgenticEvents] Goal completed:', event.payload);
          // Future: update goal status in store
        },
      );
      unlistenFns.current.push(unlistenGoalCompleted);

      console.log('[useAgenticEvents] All event listeners established');
    };

    setupListeners().catch((error) => {
      console.error('[useAgenticEvents] Failed to setup listeners:', error);
    });

    // Cleanup: unlisten all events on unmount
    return () => {
      isMountedRef.current = false;
      console.log('[useAgenticEvents] Cleaning up event listeners');
      unlistenFns.current.forEach((unlisten) => {
        unlisten();
      });
      unlistenFns.current = [];
    };
  }, []); // Empty deps - setup once on mount, handlers updated via refs

  return null;
}

export default useAgenticEvents;
