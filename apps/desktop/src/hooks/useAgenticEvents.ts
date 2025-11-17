import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type {
  FileOperation,
  TerminalCommand,
  ToolExecution,
  Screenshot,
  AgentStatus,
  BackgroundTask,
  ApprovalRequest,
} from '../stores/unifiedChatStore';

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
    updateAgentStatus: useUnifiedChatStore.getState().updateAgentStatus,
    addAgent: useUnifiedChatStore.getState().addAgent,
    updateBackgroundTask: useUnifiedChatStore.getState().updateBackgroundTask,
    addBackgroundTask: useUnifiedChatStore.getState().addBackgroundTask,
    addApprovalRequest: useUnifiedChatStore.getState().addApprovalRequest,
    approveOperation: useUnifiedChatStore.getState().approveOperation,
    rejectOperation: useUnifiedChatStore.getState().rejectOperation,
  });

  // Update handler refs when store changes
  useEffect(() => {
    const unsubscribe = useUnifiedChatStore.subscribe((state) => {
      handlersRef.current = {
        addFileOperation: state.addFileOperation,
        addTerminalCommand: state.addTerminalCommand,
        addToolExecution: state.addToolExecution,
        addScreenshot: state.addScreenshot,
        updateAgentStatus: state.updateAgentStatus,
        addAgent: state.addAgent,
        updateBackgroundTask: state.updateBackgroundTask,
        addBackgroundTask: state.addBackgroundTask,
        addApprovalRequest: state.addApprovalRequest,
        approveOperation: state.approveOperation,
        rejectOperation: state.rejectOperation,
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
