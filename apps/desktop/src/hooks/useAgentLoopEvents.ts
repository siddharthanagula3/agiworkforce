/**
 * useAgentLoopEvents
 *
 * Listens to agentic loop lifecycle events:
 * - agent:plan_update, agent:action_update, agent:permission_required
 * - agent:metrics, agent:spawned
 * - agent:step-started/completed/failed, agent:task-completed/failed
 * - background_agent:completed/failed
 * - agi:goal_progress, agi:step_completed, agi:goal_completed
 *
 * Extracted from useAgenticEvents.ts. Can be used independently by
 * components that only need agent loop state.
 */
import { invoke, listen, UnlistenFn } from '../lib/tauri-mock';
import { EVENTS } from '../constants/event-names';
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
  PlanStep,
} from '../stores/unifiedChatStore';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';

// =============================================================================
// Event payload types
// =============================================================================

// agent:timeline discriminated union
export type TimelineEventType =
  | { type: 'task_queued'; task_id: string; description: string; priority: 'low' | 'normal' | 'high' | 'critical' }
  | { type: 'task_started'; task_id: string; description: string }
  | { type: 'step_started'; task_id: string; step_index: number; step_description: string }
  | { type: 'step_completed'; task_id: string; step_index: number; result: unknown }
  | { type: 'step_failed'; task_id: string; step_index: number; error: string }
  | { type: 'tool_called'; task_id: string; tool_name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; task_id: string; tool_name: string; success: boolean; result: unknown; error: string | null }
  | { type: 'task_completed'; task_id: string; result: unknown }
  | { type: 'task_failed'; task_id: string; error: string }
  | { type: 'task_cancelled'; task_id: string; reason: string }
  | { type: 'reasoning'; task_id: string; thought: string; duration_ms: number | null }
  | { type: 'todo_updated'; task_id: string; todos: unknown[] }
  | { type: 'file_modified'; task_id: string; file_path: string; operation: string }
  | { type: 'terminal_spawned'; task_id: string; session_id: string; command: string | null }
  | { type: 'auto_approval_triggered'; task_id: string; action: string; safe: boolean };

// diagnostics:progress payload
export interface DiagnosticsProgressEvent {
  currentCheck: string;
  currentIndex: number;
  totalChecks: number;
  completedResults: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    message: string;
    duration_ms?: number;
  }>;
}

// diagnostics:complete payload
export interface DiagnosticsCompleteEvent {
  report: {
    overall_status: 'pass' | 'fail' | 'warn';
    checks: DiagnosticsProgressEvent['completedResults'];
    elapsed_ms: number;
    timestamp: string;
  };
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

export interface AgentSpawnedEvent {
  agent_id: string;
  goal?: string;
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

// =============================================================================
// Shared utility types (passed in by the parent hook)
// =============================================================================

export interface AgentLoopEventDeps {
  isMountedRef: React.MutableRefObject<boolean>;
  upsertActionLogEntry: (
    entry: Partial<ActionLogEntry> & { id?: string; actionId?: string; type?: ActionLogEntryType },
  ) => void;
  normalizeActionStatus: (status?: string) => ActionLogStatus;
  normalizeRiskLevel: (risk?: string) => 'low' | 'medium' | 'high';
  mapActionType: (type?: string) => ActionLogEntryType;
  focusSidecar: (eventType: string) => void;
  handlersRef: React.MutableRefObject<{
    addApprovalRequest: (request: Omit<ApprovalRequest, 'status' | 'createdAt'>) => void;
    setPlan: (plan: {
      id: string;
      description: string;
      steps: PlanStep[];
      createdAt: Date;
      updatedAt: Date;
    }) => void;
    updatePlanStep: (stepId: string, updates: Partial<PlanStep>) => void;
    setWorkflowContext: (ctx: { hash: string; description: string; entryPoint: string }) => void;
    addAgent: (agent: AgentStatus) => void;
    updateAgentStatus: (agentId: string, updates: Partial<AgentStatus>) => void;
    setAgentStatus: (status: AgentStatus) => void;
  }>;
}

// =============================================================================
// Hook
// =============================================================================

export function useAgentLoopEvents(deps: AgentLoopEventDeps): void {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const {
    isMountedRef,
    upsertActionLogEntry,
    normalizeActionStatus,
    normalizeRiskLevel,
    mapActionType,
    focusSidecar,
    handlersRef,
  } = deps;

  useEffect(() => {
    const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);

    const setup = async () => {
      if (!isMountedRef.current) return;

      // agent:plan_update
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
                console.error('[useAgentLoopEvents] Failed to compute workflow hash', hashError);
              }
            }

            if (workflowHash && entryPoint) {
              handlersRef.current.setWorkflowContext({
                hash: workflowHash,
                description: plan.description,
                entryPoint,
              });
              if (isTauri) {
                let timeoutId: ReturnType<typeof setTimeout> | undefined;
                try {
                  const INVOKE_TIMEOUT_MS = 10000;
                  await Promise.race([
                    invoke('agent_set_workflow_hash', { workflowHash }),
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
                  console.error('[useAgentLoopEvents] Failed to push workflow hash', error);
                } finally {
                  if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                  }
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
          } catch (error) {
            console.error('[useAgentLoopEvents] Error in agent:plan_update handler', error);
          }
        },
      ).catch((error) => {
        console.error('[useAgentLoopEvents] Failed to setup agent:plan_update listener', error);
        return () => {};
      });
      push(unlistenPlanUpdate);

      // agent:action_update
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

      // agent:permission_required
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
            riskLevel: normalizeRiskLevel(payload.riskLevel ?? payload.scope.risk),
            details: { scope: payload.scope },
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

      // agent:metrics
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

      // agent:spawned
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

      // agent:step-started
      const unlistenStepStarted = await listen<{
        taskId: string;
        step: string;
        stepIndex: number;
        totalSteps: number;
        tool?: string;
        type?: string;
        url?: string;
      }>('agent:step-started', (event) => {
        if (!isMountedRef.current) return;
        const { taskId, step, stepIndex, totalSteps } = event.payload;
        const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
        addActionTrailEntry?.({
          type: 'running',
          message: `Step ${stepIndex + 1}/${totalSteps}: ${step}`,
          progress: (stepIndex / totalSteps) * 100,
        });
        upsertActionLogEntry({
          id: `${taskId}-step-${stepIndex}`,
          type: 'plan',
          title: `Step ${stepIndex + 1}/${totalSteps}`,
          description: step,
          status: 'running',
        });
        const isBrowserStep =
          event.payload.tool === 'browser_navigate' || event.payload.type === 'browser';
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', {
            detail: {
              active: isBrowserStep,
              url: isBrowserStep ? (event.payload.url ?? '') : '',
            },
          }),
        );
      });
      push(unlistenStepStarted);

      // agent:step-completed
      const unlistenStepCompleted2 = await listen<{
        taskId: string;
        step: string;
        result: string;
        stepIndex: number;
      }>('agent:step-completed', (event) => {
        if (!isMountedRef.current) return;
        const { taskId, step, result, stepIndex } = event.payload;
        upsertActionLogEntry({
          id: `${taskId}-step-${stepIndex}`,
          type: 'plan',
          title: `Step ${stepIndex + 1} completed`,
          description: step,
          status: 'success',
          result,
        });
      });
      push(unlistenStepCompleted2);

      // agent:step-failed
      const unlistenStepFailed = await listen<{
        taskId: string;
        step: string;
        error: string;
        attempt: number;
        retrying: boolean;
      }>('agent:step-failed', (event) => {
        if (!isMountedRef.current) return;
        const { taskId, step, error, attempt, retrying } = event.payload;
        upsertActionLogEntry({
          id: `${taskId}-step-attempt-${attempt}`,
          type: 'plan',
          title: retrying ? `Step failed (retrying, attempt ${attempt})` : 'Step failed',
          description: step,
          status: retrying ? 'running' : 'failed',
          error,
        });
      });
      push(unlistenStepFailed);

      // agent:task-completed
      const unlistenTaskCompleted = await listen<{
        taskId: string;
        success: boolean;
        stepsCompleted: number;
      }>('agent:task-completed', (event) => {
        if (!isMountedRef.current) return;
        const { taskId, stepsCompleted } = event.payload;
        const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
        addActionTrailEntry?.({
          type: 'completed',
          message: `Task completed (${stepsCompleted} steps)`,
          progress: 100,
          fadeAfter: 10000,
        });
        upsertActionLogEntry({
          id: taskId,
          type: 'plan',
          title: 'Task completed',
          description: `Successfully completed ${stepsCompleted} steps`,
          status: 'success',
        });
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenTaskCompleted);

      // agent:task-failed
      const unlistenTaskFailed = await listen<{
        taskId: string;
        error: string;
      }>('agent:task-failed', (event) => {
        if (!isMountedRef.current) return;
        const { taskId, error: taskError } = event.payload;
        const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
        addActionTrailEntry?.({
          type: 'error',
          message: `Task failed: ${taskError}`,
          progress: 0,
        });
        upsertActionLogEntry({
          id: taskId,
          type: 'plan',
          title: 'Task failed',
          description: taskError,
          status: 'failed',
          error: taskError,
        });
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenTaskFailed);

      // background_agent:completed
      const unlistenBgAgentCompleted = await listen<{
        agentId: string;
        goal: string;
        summaryPath: string;
      }>('background_agent:completed', async (event) => {
        if (!isMountedRef.current) return;
        const { agentId, goal, summaryPath } = event.payload;
        try {
          const { sendNotification } = await import('@tauri-apps/plugin-notification');
          await sendNotification({
            title: 'AGI Workforce — Task Completed',
            body: goal.length > 120 ? goal.slice(0, 117) + '...' : goal,
          });
        } catch {
          // Notification plugin unavailable — silently skip
        }
        upsertActionLogEntry({
          id: agentId,
          type: 'plan',
          title: 'Background task completed',
          description: summaryPath ? `${goal}\n\nReport saved: ${summaryPath}` : goal,
          status: 'success',
        });
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenBgAgentCompleted);

      // background_agent:failed
      const unlistenBgAgentFailed = await listen<{
        agentId: string;
        goal: string;
        error: string;
      }>('background_agent:failed', async (event) => {
        if (!isMountedRef.current) return;
        const { agentId, goal: _goal, error } = event.payload;
        try {
          const { sendNotification } = await import('@tauri-apps/plugin-notification');
          await sendNotification({
            title: 'AGI Workforce — Task Failed',
            body: error.length > 120 ? error.slice(0, 117) + '...' : error,
          });
        } catch {
          // Notification plugin unavailable — silently skip
        }
        upsertActionLogEntry({
          id: agentId,
          type: 'plan',
          title: 'Background task failed',
          description: error,
          status: 'failed',
          error,
        });
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenBgAgentFailed);

      // agi:goal_progress
      const unlistenGoalProgress = await listen<GoalProgressEvent>(
        EVENTS.AGI_GOAL_PROGRESS,
        (event) => {
          if (!isMountedRef.current) return;
          const { goalId, progress, currentStep } = event.payload;
          const state = useUnifiedChatStore.getState();
          const existingAgent = state.agents.find(
            (a) => a.currentGoal === goalId || a.id === goalId,
          );
          if (existingAgent) {
            handlersRef.current.updateAgentStatus(existingAgent.id, {
              progress,
              currentStep,
              status: 'running',
            });
          }
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: 'running',
            message: currentStep || `Progress: ${Math.round(progress * 100)}%`,
            progress: progress * 100,
            fadeAfter: 10000,
          });
        },
      );
      push(unlistenGoalProgress);

      // agi:step_completed
      const unlistenStepCompleted = await listen<StepCompletedEvent>(
        'agi:step_completed',
        (event) => {
          if (!isMountedRef.current) return;
          const { stepId, success, output, error } = event.payload;
          handlersRef.current.updatePlanStep(stepId, {
            status: success ? 'success' : 'failed',
            result: output || error,
          });
          upsertActionLogEntry({
            id: stepId,
            actionId: stepId,
            type: 'terminal',
            title: success ? 'Step completed' : 'Step failed',
            description: output || error,
            status: success ? 'success' : 'failed',
            workflowHash: undefined,
          });
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: success ? 'completed' : 'error',
            message: success ? output || 'Step completed' : error || 'Step failed',
            fadeAfter: 5000,
          });
        },
      );
      push(unlistenStepCompleted);

      // agi:goal_completed
      const unlistenGoalCompleted = await listen<GoalCompletedEvent>(
        'agi:goal_completed',
        (event) => {
          if (!isMountedRef.current) return;
          const { goalId, success, result, error } = event.payload;
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
          const currentAgentStatus = state.agentStatus;
          if (
            currentAgentStatus &&
            (currentAgentStatus.currentGoal === goalId || currentAgentStatus.id === goalId)
          ) {
            handlersRef.current.setAgentStatus({
              ...currentAgentStatus,
              status: success ? 'completed' : 'failed',
              progress: success ? 100 : currentAgentStatus.progress,
              completedAt: new Date(),
              error: error,
            });
          }
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: success ? 'completed' : 'error',
            message: success ? result || 'Goal completed successfully' : error || 'Goal failed',
            fadeAfter: 10000,
          });
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

      // agent:timeline
      const unlistenTimeline = await listen<TimelineEventType>('agent:timeline', (event) => {
        if (!isMountedRef.current) return;
        const payload = event.payload;
        console.debug('[agent:timeline]', payload.type, payload);

        if (payload.type === 'reasoning') {
          console.debug('[agent:timeline] reasoning', payload.thought, payload.duration_ms);
        } else if (payload.type === 'task_completed') {
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: 'completed',
            message: 'Task completed',
            progress: 100,
            fadeAfter: 10000,
          });
          upsertActionLogEntry({
            id: `timeline-${payload.task_id}-completed`,
            type: 'plan',
            title: 'Task completed',
            description: String(payload.result ?? ''),
            status: 'success',
          });
        } else if (payload.type === 'task_failed') {
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: 'error',
            message: `Task failed: ${payload.error}`,
            progress: 0,
          });
          upsertActionLogEntry({
            id: `timeline-${payload.task_id}-failed`,
            type: 'plan',
            title: 'Task failed',
            description: payload.error,
            status: 'failed',
            error: payload.error,
          });
        }
      }).catch((error) => {
        console.error('[useAgentLoopEvents] Failed to setup agent:timeline listener', error);
        return () => {};
      });
      push(unlistenTimeline);

      // diagnostics:progress
      const unlistenDiagnosticsProgress = await listen<DiagnosticsProgressEvent>(
        'diagnostics:progress',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          console.debug('[diagnostics:progress]', payload.currentCheck, payload.currentIndex, '/', payload.totalChecks);
        },
      ).catch((error) => {
        console.error('[useAgentLoopEvents] Failed to setup diagnostics:progress listener', error);
        return () => {};
      });
      push(unlistenDiagnosticsProgress);

      // diagnostics:complete
      const unlistenDiagnosticsComplete = await listen<DiagnosticsCompleteEvent>(
        'diagnostics:complete',
        (event) => {
          if (!isMountedRef.current) return;
          const { report } = event.payload;
          console.debug('[diagnostics:complete]', report.overall_status, report.elapsed_ms, 'ms');
        },
      ).catch((error) => {
        console.error('[useAgentLoopEvents] Failed to setup diagnostics:complete listener', error);
        return () => {};
      });
      push(unlistenDiagnosticsComplete);
    };

    setup().catch((error) => {
      console.error('[useAgentLoopEvents] Failed to setup listeners:', error);
    });

    return () => {
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    };
    // Listener registration runs once; handlers access latest store via refs/getState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useAgentLoopEvents;
