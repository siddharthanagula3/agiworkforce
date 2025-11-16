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
  const addFileOperation = useUnifiedChatStore((state) => state.addFileOperation);
  const addTerminalCommand = useUnifiedChatStore((state) => state.addTerminalCommand);
  const addToolExecution = useUnifiedChatStore((state) => state.addToolExecution);
  const addScreenshot = useUnifiedChatStore((state) => state.addScreenshot);
  const updateAgentStatus = useUnifiedChatStore((state) => state.updateAgentStatus);
  const addAgent = useUnifiedChatStore((state) => state.addAgent);
  const updateBackgroundTask = useUnifiedChatStore((state) => state.updateBackgroundTask);
  const addBackgroundTask = useUnifiedChatStore((state) => state.addBackgroundTask);
  const addApprovalRequest = useUnifiedChatStore((state) => state.addApprovalRequest);
  const approveOperation = useUnifiedChatStore((state) => state.approveOperation);
  const rejectOperation = useUnifiedChatStore((state) => state.rejectOperation);

  useEffect(() => {
    const setupListeners = async () => {
      // File Operation Events
      const unlistenFileOp = await listen<FileOperationEvent>('agi:file_operation', (event) => {
        console.log('[useAgenticEvents] File operation:', event.payload);
        addFileOperation(event.payload.operation);
      });
      unlistenFns.current.push(unlistenFileOp);

      // Terminal Command Events
      const unlistenTerminal = await listen<TerminalCommandEvent>(
        'agi:terminal_command',
        (event) => {
          console.log('[useAgenticEvents] Terminal command:', event.payload);
          addTerminalCommand(event.payload.command);
        },
      );
      unlistenFns.current.push(unlistenTerminal);

      // Tool Execution Events
      const unlistenToolExec = await listen<ToolExecutionEvent>('agi:tool_execution', (event) => {
        console.log('[useAgenticEvents] Tool execution:', event.payload);
        addToolExecution(event.payload.execution);
      });
      unlistenFns.current.push(unlistenToolExec);

      // Screenshot Events
      const unlistenScreenshot = await listen<ScreenshotEvent>('agi:screenshot', (event) => {
        console.log('[useAgenticEvents] Screenshot:', event.payload);
        addScreenshot(event.payload.screenshot);
      });
      unlistenFns.current.push(unlistenScreenshot);

      // Agent Status Events
      const unlistenAgentStatus = await listen<AgentStatusEvent>('agent:status_update', (event) => {
        console.log('[useAgenticEvents] Agent status update:', event.payload);
        const existingAgents = useUnifiedChatStore.getState().agents;
        const agentExists = existingAgents.some((a) => a.id === event.payload.agent.id);

        if (agentExists) {
          updateAgentStatus(event.payload.agent.id, event.payload.agent);
        } else {
          addAgent(event.payload.agent);
        }
      });
      unlistenFns.current.push(unlistenAgentStatus);

      // Background Task Events
      const unlistenTaskProgress = await listen<BackgroundTaskEvent>('task:progress', (event) => {
        console.log('[useAgenticEvents] Task progress:', event.payload);
        const existingTasks = useUnifiedChatStore.getState().backgroundTasks;
        const taskExists = existingTasks.some((t) => t.id === event.payload.task.id);

        if (taskExists) {
          updateBackgroundTask(event.payload.task.id, event.payload.task);
        } else {
          addBackgroundTask(event.payload.task);
        }
      });
      unlistenFns.current.push(unlistenTaskProgress);

      const unlistenTaskCompleted = await listen<BackgroundTaskEvent>('task:completed', (event) => {
        console.log('[useAgenticEvents] Task completed:', event.payload);
        updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      unlistenFns.current.push(unlistenTaskCompleted);

      const unlistenTaskFailed = await listen<BackgroundTaskEvent>('task:failed', (event) => {
        console.log('[useAgenticEvents] Task failed:', event.payload);
        updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      unlistenFns.current.push(unlistenTaskFailed);

      // Approval Request Events
      const unlistenApprovalRequired = await listen<ApprovalRequestEvent>(
        'agi:approval_required',
        (event) => {
          console.log('[useAgenticEvents] Approval required:', event.payload);
          addApprovalRequest(event.payload.approval);
        },
      );
      unlistenFns.current.push(unlistenApprovalRequired);

      const unlistenApprovalGranted = await listen<ApprovalRequestEvent>(
        'agi:approval_granted',
        (event) => {
          console.log('[useAgenticEvents] Approval granted:', event.payload);
          approveOperation(event.payload.approval.id);
        },
      );
      unlistenFns.current.push(unlistenApprovalGranted);

      const unlistenApprovalDenied = await listen<ApprovalRequestEvent>(
        'agi:approval_denied',
        (event) => {
          console.log('[useAgenticEvents] Approval denied:', event.payload);
          rejectOperation(event.payload.approval.id, event.payload.approval.rejectionReason);
        },
      );
      unlistenFns.current.push(unlistenApprovalDenied);

      // Goal Progress Events (for future use)
      const unlistenGoalProgress = await listen<GoalProgressEvent>('agi:goal_progress', (event) => {
        console.log('[useAgenticEvents] Goal progress:', event.payload);
        // Future: update goal progress in store
      });
      unlistenFns.current.push(unlistenGoalProgress);

      const unlistenStepCompleted = await listen<StepCompletedEvent>(
        'agi:step_completed',
        (event) => {
          console.log('[useAgenticEvents] Step completed:', event.payload);
          // Future: update step status in store
        },
      );
      unlistenFns.current.push(unlistenStepCompleted);

      const unlistenGoalCompleted = await listen<GoalCompletedEvent>(
        'agi:goal_completed',
        (event) => {
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
      console.log('[useAgenticEvents] Cleaning up event listeners');
      unlistenFns.current.forEach((unlisten) => {
        unlisten();
      });
      unlistenFns.current = [];
    };
  }, []); // Empty deps - setup once on mount

  return null;
}

export default useAgenticEvents;
