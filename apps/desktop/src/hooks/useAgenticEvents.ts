import { invoke, listen, UnlistenFn } from '../lib/tauri-mock';
import { EVENTS } from '../constants/event-names';
import { toast } from 'sonner';
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
import type { Artifact } from '../types/chat';
import type { EnhancedMessage } from '../stores/chat/types';

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

interface ExtensionPageAction {
  id: string;
  type: string;
  selector?: string | null;
  value?: string | null;
  delay?: number | null;
}

export interface ExtensionPageContextEvent {
  task_id: string;
  url: string;
  title: string;
  tab_id: number;
  timestamp: number;
  selected_text?: string | null;
  actions?: ExtensionPageAction[];
}

export interface ExtensionTaskResultEvent {
  task_id: string;
  success: boolean;
  screenshot_path?: string | null;
  result?: unknown;
  error?: string | null;
  actions_performed?: number;
  duration?: number;
}

export interface ExtensionConnectionStatusEvent {
  connected: boolean;
  status?: string;
  extension_id?: string;
  reason?: string;
  timestamp?: number;
}

interface ExtensionStatusDiagnosticsPayload {
  status?: string;
  diagnostics?: {
    recommendations?: string[];
    realtime_token?: {
      valid?: boolean;
      exists?: boolean;
      error?: string | null;
    };
    native_connection?: {
      state?: string;
      extension_id?: string | null;
      ready?: boolean;
    };
  };
}

export function useAgenticEvents() {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isMountedRef = useRef(false);
  const setupInProgressRef = useRef(false);
  const extensionPreflightCheckedRef = useRef(false);
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
    setAgentStatus: useUnifiedChatStore.getState().setAgentStatus,
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

  // AUDIT-APPROVAL-049 fix: Consistent risk level normalization across all event handlers
  const normalizeRiskLevel = (risk?: string): 'low' | 'medium' | 'high' => {
    if (!risk) return 'high';
    const normalized = risk.toLowerCase();
    if (normalized === 'critical' || normalized === 'high') return 'high';
    if (normalized === 'medium') return 'medium';
    return 'low';
  };

  const mapActionType = (type?: string): ActionLogEntryType => {
    switch ((type ?? '').toLowerCase()) {
      case 'filesystem':
      case 'file':
      case 'cloud':
        return 'filesystem';
      case 'browser':
        return 'browser';
      case 'automation':
        return 'ui';
      case 'calendar':
      case 'gmail':
      case 'email':
        return 'mcp';
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

  const mapToolNameToActionType = (toolName?: string): ActionLogEntryType => {
    const normalized = (toolName ?? '').toLowerCase();
    if (
      normalized.startsWith('browser_') ||
      normalized.startsWith('extension_') ||
      normalized.startsWith('mcp__playwright__') ||
      normalized.startsWith('web_')
    ) {
      return 'browser';
    }
    if (
      normalized.startsWith('mcp__') ||
      normalized.startsWith('mcp_') ||
      normalized.includes('mcp')
    ) {
      return 'mcp';
    }
    if (
      normalized.startsWith('file_') ||
      normalized.includes('filesystem') ||
      normalized.includes('directory') ||
      normalized.includes('cloud_')
    ) {
      return 'filesystem';
    }
    if (
      normalized.startsWith('automation_') ||
      normalized.startsWith('ui_') ||
      normalized.includes('desktop')
    ) {
      return 'ui';
    }
    return 'terminal';
  };

  const decodeMcpIdComponent = (value: string): string => {
    if (value.startsWith('hex:')) {
      try {
        const hex = value.slice(4);
        const bytes = hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];
        return new TextDecoder().decode(new Uint8Array(bytes));
      } catch {
        return value;
      }
    }

    if (value.startsWith('b64:')) {
      try {
        const encoded = value.slice(4).replace(/-/g, '+').replace(/_/g, '/');
        const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
        return atob(padded);
      } catch {
        return value;
      }
    }
    return value;
  };

  const getMcpToolDisplayName = (toolId: string): string => {
    // New/legacy canonical format: mcp__<server>__<tool>
    if (toolId.startsWith('mcp__')) {
      const parts = toolId.split('__', 3);
      if (parts.length === 3) {
        const decoded = decodeMcpIdComponent(parts[2] || '');
        return decoded.replace(/_/g, ' ');
      }
    }

    // Legacy underscore format fallback: mcp_<server>_<tool>
    return toolId.replace(/^mcp_[^_]+_/, '').replace(/_/g, ' ');
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

  const runExtensionPreflightCheck = () => {
    if (extensionPreflightCheckedRef.current || !isTauri) {
      return;
    }
    extensionPreflightCheckedRef.current = true;

    void (async () => {
      try {
        const response = (await invoke('extension_status')) as ExtensionStatusDiagnosticsPayload;
        const status = String(response?.status ?? 'unknown');
        const diagnostics = response?.diagnostics;
        const recommendations = diagnostics?.recommendations ?? [];
        const tokenValid = diagnostics?.realtime_token?.valid ?? false;
        const connectionState = String(diagnostics?.native_connection?.state ?? 'unknown');
        const transportReady = diagnostics?.native_connection?.ready === true;
        const degraded = status !== 'ok';

        upsertActionLogEntry({
          id: 'extension-preflight',
          actionId: 'extension-preflight',
          type: 'browser',
          title: degraded
            ? 'Extension transport preflight degraded'
            : 'Extension transport preflight',
          description: degraded
            ? (recommendations[0] ?? 'Extension transport diagnostics reported degraded status')
            : 'Extension transport diagnostics passed',
          status: degraded ? 'failed' : 'success',
          metadata: {
            status,
            tokenValid,
            connectionState,
            transportReady,
            recommendations,
            diagnostics,
          },
        });

        const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
        addActionTrailEntry?.({
          type: degraded ? 'error' : 'completed',
          message: degraded
            ? `Extension preflight degraded: ${recommendations[0] ?? 'check extension_status diagnostics'}`
            : 'Extension preflight checks passed',
          metadata: {
            status,
            connection_state: connectionState,
            token_valid: tokenValid,
            transport_ready: transportReady,
          },
          fadeAfter: 5000,
        });
        if (degraded) {
          // Re-check on next extension-native tool attempt until transport is healthy.
          extensionPreflightCheckedRef.current = false;
        }
      } catch (error) {
        extensionPreflightCheckedRef.current = false;
        upsertActionLogEntry({
          id: 'extension-preflight',
          actionId: 'extension-preflight',
          type: 'browser',
          title: 'Extension transport preflight failed',
          description: 'Could not query extension transport diagnostics',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown preflight error',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
        addActionTrailEntry?.({
          type: 'error',
          message: `Extension preflight failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          fadeAfter: 5000,
        });
      }
    })();
  };

  const safeJsonStringify = (value: unknown): string | undefined => {
    if (value === undefined || value === null) {
      return undefined;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const getMergedMessageArtifacts = (message: EnhancedMessage): Artifact[] => {
    const artifacts = message.artifacts ?? [];
    const metadataArtifacts = Array.isArray(message.metadata?.artifacts)
      ? message.metadata.artifacts
      : [];
    if (metadataArtifacts.length === 0) {
      return [...artifacts];
    }

    const merged: Artifact[] = [...artifacts];
    const existingIds = new Set(artifacts.map((artifact) => artifact.id));
    for (const artifact of metadataArtifacts) {
      if (!existingIds.has(artifact.id)) {
        merged.push(artifact);
      }
    }
    return merged;
  };

  const resolveActiveConversationMessages = () => {
    const state = useUnifiedChatStore.getState();
    const activeConversationId = state.activeConversationId;
    if (activeConversationId && state.messagesByConversation[activeConversationId]) {
      return state.messagesByConversation[activeConversationId] ?? [];
    }
    return state.messages;
  };

  const resolveInlineExtensionTargetMessageId = (): string | null => {
    const state = useUnifiedChatStore.getState();
    const conversationMessages = resolveActiveConversationMessages();
    if (conversationMessages.length === 0) {
      return null;
    }

    const streamingMessageId = state.currentStreamingMessageId;
    if (streamingMessageId && conversationMessages.some((msg) => msg.id === streamingMessageId)) {
      return streamingMessageId;
    }

    const latestAssistant = [...conversationMessages]
      .reverse()
      .find((msg) => msg.role === 'assistant');
    if (latestAssistant) {
      return latestAssistant.id;
    }

    const latestSystem = [...conversationMessages].reverse().find((msg) => msg.role === 'system');
    if (latestSystem) {
      return latestSystem.id;
    }

    return null;
  };

  const ensureExtensionMessageTarget = (
    fallbackContent: string,
    fallbackStatus: 'running' | 'completed' | 'failed',
  ): string | null => {
    const existingTarget = resolveInlineExtensionTargetMessageId();
    if (existingTarget) {
      return existingTarget;
    }

    const state = useUnifiedChatStore.getState();
    if (!state.activeConversationId) {
      return null;
    }

    return state.addMessage({
      role: 'assistant',
      content: fallbackContent,
      metadata: {
        event: 'extension',
        status: fallbackStatus,
        sidecarType: 'browser',
        streaming: false,
      },
      artifacts: [],
    });
  };

  const upsertInlineExtensionArtifact = (
    taskId: string,
    patch: Record<string, unknown>,
    options?: {
      fallbackContent?: string;
      fallbackStatus?: 'running' | 'completed' | 'failed';
    },
  ) => {
    const targetMessageId = ensureExtensionMessageTarget(
      options?.fallbackContent ?? 'Extension update received.',
      options?.fallbackStatus ?? 'running',
    );
    if (!targetMessageId) {
      return;
    }

    const state = useUnifiedChatStore.getState();
    const conversationMessages = resolveActiveConversationMessages();
    const targetMessage = conversationMessages.find((msg) => msg.id === targetMessageId);
    if (!targetMessage) {
      return;
    }

    const artifactId = `extension-${taskId}`;
    const artifacts = getMergedMessageArtifacts(targetMessage);
    const index = artifacts.findIndex((artifact) => artifact.id === artifactId);
    const existingArtifact =
      index >= 0 ? (artifacts[index] as Artifact & Record<string, unknown>) : null;
    const patchMetadata = patch['metadata'];
    const mergedMetadata = {
      ...((existingArtifact?.metadata as Record<string, unknown> | undefined) ?? {}),
      ...(patchMetadata && typeof patchMetadata === 'object'
        ? (patchMetadata as Record<string, unknown>)
        : {}),
    };

    const nextArtifact = {
      id: artifactId,
      type: 'code' as const,
      title: 'Extension task',
      content: String(patch['content'] ?? existingArtifact?.content ?? ''),
      ...(existingArtifact ?? {}),
      ...patch,
      metadata: mergedMetadata,
    } as Artifact;

    const nextArtifacts =
      index >= 0
        ? artifacts.map((artifact, artifactIndex) =>
            artifactIndex === index ? nextArtifact : artifact,
          )
        : [...artifacts, nextArtifact];

    const metadataStatus = (nextArtifact as unknown as Record<string, unknown>)['status'];
    const currentMetadata = targetMessage.metadata ?? {};
    state.updateMessage(targetMessageId, {
      artifacts: nextArtifacts,
      metadata: {
        ...currentMetadata,
        artifacts: nextArtifacts,
        event: 'extension',
        sidecarType: 'browser',
        ...(typeof metadataStatus === 'string' ? { status: metadataStatus } : {}),
      },
    });
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
        setAgentStatus: state.setAgentStatus,
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

      const unlistenExtensionPageContext = await listen<ExtensionPageContextEvent>(
        'extension:page-context',
        safeHandler('extension:page-context', (payload) => {
          const actionCount = payload.actions?.length ?? 0;
          const selectedText =
            typeof payload.selected_text === 'string' ? payload.selected_text.trim() : '';
          const selectedTextPreview =
            selectedText.length > 160 ? `${selectedText.slice(0, 160)}...` : selectedText;
          const actionSummary =
            actionCount > 0
              ? `${actionCount} planned action${actionCount === 1 ? '' : 's'}`
              : 'No planned actions';

          upsertActionLogEntry({
            id: `extension-${payload.task_id}`,
            actionId: payload.task_id,
            type: 'browser',
            title: 'Extension page context received',
            description: `${payload.title || 'Untitled page'} (${payload.url})`,
            status: 'running',
            metadata: {
              tabId: payload.tab_id,
              actionCount,
              actions: payload.actions,
              selectedText: payload.selected_text ?? null,
            },
          });

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Extension captured page context: ${payload.title || payload.url}`,
            metadata: {
              task_id: payload.task_id,
              tab_id: payload.tab_id,
              action_count: actionCount,
            },
            fadeAfter: 4000,
          });

          const stdoutLines = [
            `URL: ${payload.url}`,
            `Title: ${payload.title || 'Untitled page'}`,
            `Tab ID: ${payload.tab_id}`,
            `Actions: ${actionSummary}`,
            selectedTextPreview ? `Selected text: ${selectedTextPreview}` : null,
          ].filter((line): line is string => Boolean(line));

          upsertInlineExtensionArtifact(
            payload.task_id,
            {
              toolName: 'extension_page_context',
              type: 'code',
              title: 'Extension page context',
              status: 'running',
              success: true,
              command: `extension.page_context tab=${payload.tab_id}`,
              stdout: stdoutLines.join('\n'),
              exitCode: 0,
              content: stdoutLines.join('\n'),
              metadata: {
                taskId: payload.task_id,
                tabId: payload.tab_id,
                url: payload.url,
                title: payload.title,
                actionCount,
                actions: payload.actions ?? [],
                selectedText: payload.selected_text ?? null,
                timestamp: payload.timestamp,
              },
            },
            {
              fallbackContent: `Analyzing page context for ${payload.title || payload.url}`,
              fallbackStatus: 'running',
            },
          );
          focusSidecar('browser');
        }),
      );
      push(unlistenExtensionPageContext);

      const unlistenExtensionConnectionStatus = await listen<ExtensionConnectionStatusEvent>(
        'extension:connection-status',
        safeHandler('extension:connection-status', (payload) => {
          const isConnected = payload.connected === true;
          const statusLabel = String(
            payload.status ?? (isConnected ? 'connected' : 'disconnected'),
          );
          const description = isConnected
            ? `Extension connected${payload.extension_id ? ` (${payload.extension_id})` : ''}`
            : `Extension disconnected${payload.reason ? `: ${payload.reason}` : ''}`;

          upsertActionLogEntry({
            id: 'extension-connection',
            actionId: 'extension-connection',
            type: 'browser',
            title: 'Extension connection status',
            description,
            status: isConnected ? 'success' : 'failed',
            metadata: {
              connected: isConnected,
              status: statusLabel,
              extensionId: payload.extension_id ?? null,
              reason: payload.reason ?? null,
              timestamp: payload.timestamp ?? Date.now(),
            },
          });

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: isConnected ? 'completed' : 'error',
            message: isConnected ? 'Browser extension connected' : 'Browser extension disconnected',
            metadata: {
              extension_id: payload.extension_id ?? null,
              reason: payload.reason ?? null,
            },
            fadeAfter: 4000,
          });

          if (!isConnected) {
            // Allow preflight to run again on the next extension-native tool call.
            extensionPreflightCheckedRef.current = false;
          } else {
            runExtensionPreflightCheck();
          }

          focusSidecar('browser');
        }),
      );
      push(unlistenExtensionConnectionStatus);

      const unlistenExtensionTaskResult = await listen<ExtensionTaskResultEvent>(
        'extension:task-result',
        safeHandler('extension:task-result', (payload) => {
          const actionId = `extension-${payload.task_id}`;
          const status: ActionLogStatus = payload.success ? 'success' : 'failed';
          upsertActionLogEntry({
            id: actionId,
            actionId: payload.task_id,
            type: 'browser',
            title: payload.success ? 'Extension task completed' : 'Extension task failed',
            description: payload.success
              ? `Performed ${payload.actions_performed ?? 0} action(s) in ${payload.duration ?? 0}ms`
              : (payload.error ?? 'Extension task failed'),
            status,
            result: payload.success ? JSON.stringify(payload.result ?? {}) : undefined,
            error: payload.success ? undefined : (payload.error ?? 'Unknown extension task error'),
            metadata: {
              screenshotPath: payload.screenshot_path ?? null,
              actionsPerformed: payload.actions_performed ?? 0,
              durationMs: payload.duration ?? 0,
            },
          });

          const summary = payload.success
            ? `Performed ${payload.actions_performed ?? 0} action(s) in ${payload.duration ?? 0}ms`
            : (payload.error ?? 'Extension task failed');

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? `Extension task completed (${payload.actions_performed ?? 0} action${(payload.actions_performed ?? 0) === 1 ? '' : 's'})`
              : `Extension task failed: ${payload.error ?? 'Unknown error'}`,
            metadata: {
              task_id: payload.task_id,
              actions_performed: payload.actions_performed ?? 0,
              duration: payload.duration ?? 0,
            },
            fadeAfter: 4500,
          });

          const resultJson = safeJsonStringify(payload.result);
          const stdout = payload.success
            ? [summary, resultJson].filter((part): part is string => Boolean(part)).join('\n\n')
            : '';

          upsertInlineExtensionArtifact(
            payload.task_id,
            {
              toolName: 'extension_task_result',
              type: 'code',
              title: payload.success ? 'Extension task completed' : 'Extension task failed',
              status: payload.success ? 'completed' : 'failed',
              success: payload.success,
              command: `extension.task_result task=${payload.task_id}`,
              stdout,
              stderr: payload.success ? '' : (payload.error ?? 'Unknown extension task error'),
              exitCode: payload.success ? 0 : 1,
              error: payload.success
                ? undefined
                : (payload.error ?? 'Unknown extension task error'),
              content: payload.success
                ? stdout || summary
                : (payload.error ?? 'Extension task failed'),
              metadata: {
                taskId: payload.task_id,
                screenshotPath: payload.screenshot_path ?? null,
                actionsPerformed: payload.actions_performed ?? 0,
                durationMs: payload.duration ?? 0,
                result: payload.result ?? null,
              },
            },
            {
              fallbackContent: payload.success
                ? `Extension task ${payload.task_id} completed`
                : `Extension task ${payload.task_id} failed`,
              fallbackStatus: payload.success ? 'completed' : 'failed',
            },
          );
          focusSidecar('browser');
        }),
      );
      push(unlistenExtensionTaskResult);

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
            riskLevel: normalizeRiskLevel(payload.riskLevel ?? payload.scope.risk),
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

      // BUG-02 fix: Listen to autonomous agent step/task lifecycle events
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
        // Dispatch browser activity indicator for all steps; only active for browser steps
        const isBrowserStep =
          event.payload.tool === 'browser_navigate' || event.payload.type === 'browser';
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', {
            detail: { active: isBrowserStep, url: isBrowserStep ? (event.payload.url ?? '') : '' },
          }),
        );
      });
      push(unlistenStepStarted);

      const unlistenAgentStepCompleted = await listen<{
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
      push(unlistenAgentStepCompleted);

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

      const unlistenTaskCompleted2 = await listen<{
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
        // Clear browser activity indicator when task finishes
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenTaskCompleted2);

      const unlistenTaskFailed2 = await listen<{
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
        // Clear browser activity indicator when task fails
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenTaskFailed2);

      // ──────────────────────────────────────────────────────────────────────
      // Background Agent long-run completion events (overnight / 10+ hr runs)
      // ──────────────────────────────────────────────────────────────────────

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
          // Notification plugin unavailable (e.g. browser/test env) — silently skip
        }
        upsertActionLogEntry({
          id: agentId,
          type: 'plan',
          title: 'Background task completed',
          description: summaryPath ? `${goal}\n\nReport saved: ${summaryPath}` : goal,
          status: 'success',
        });
        // Clear any active browser indicator when agent task ends
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenBgAgentCompleted);

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
          // Notification plugin unavailable (e.g. browser/test env) — silently skip
        }
        upsertActionLogEntry({
          id: agentId,
          type: 'plan',
          title: 'Background task failed',
          description: error,
          status: 'failed',
          error,
        });
        // Clear any active browser indicator when agent task ends
        window.dispatchEvent(
          new CustomEvent('agi:browser-active', { detail: { active: false, url: '' } }),
        );
      });
      push(unlistenBgAgentFailed);

      // automation:permission_required — show Sonner toast + auto-open System Settings
      const unlistenPermRequired = await listen<{
        reason: string;
        message: string;
        graceful?: boolean;
      }>('automation:permission_required', (event) => {
        if (!isMountedRef.current) return;
        const { message, reason, graceful } = event.payload;
        const openSettings = () => {
          void invoke('request_automation_permission', { kind: reason ?? 'accessibility' });
        };
        if (graceful) {
          // Soft toast — agent fell back to normal LLM, user can enable if they want
          toast(message, {
            duration: 8000,
            action: { label: 'Open Settings', onClick: openSettings },
          });
        } else {
          // Hard toast — user explicitly requested agent mode but it's unavailable
          toast.error(message, {
            duration: 12000,
            action: { label: 'Open Settings', onClick: openSettings },
          });
          // Also open System Settings immediately so they can grant the permission
          openSettings();
        }
      });
      push(unlistenPermRequired);

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
            riskLevel: normalizeRiskLevel(payload.risk_level),
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
        riskLevel?: string;
        details?: Record<string, unknown>;
        impact?: string;
      }
      const unlistenApprovalRequest = await listen<ApprovalRequestPayload>(
        'approval:request',
        (event) => {
          if (!isMountedRef.current) return;
          const approvalType = (event.payload.type ||
            'terminal_command') as ApprovalRequest['type'];
          // AUDIT-APPROVAL-049 fix: Use consistent risk level normalization
          const approval: Omit<ApprovalRequest, 'status' | 'createdAt'> = {
            id: event.payload.id,
            type: approvalType,
            description: event.payload.description || 'Agent operation requires approval',
            riskLevel: normalizeRiskLevel(event.payload.riskLevel),
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

      const unlistenGoalProgress = await listen<GoalProgressEvent>(
        EVENTS.AGI_GOAL_PROGRESS,
        (event) => {
          if (!isMountedRef.current) return;
          const { goalId, progress, currentStep } = event.payload;

          // Update agent status with progress
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

          // Update action trail with progress
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

      // Calendar domain events -> unified action timeline
      const unlistenCalendarAuthStarted = await listen<string>(
        'calendar:auth_started',
        safeHandler('calendar:auth_started', (provider) => {
          const providerLabel = String(provider || 'calendar').trim() || 'calendar';
          upsertActionLogEntry({
            id: `calendar-auth-${Date.now()}`,
            type: 'terminal',
            title: 'Calendar authorization started',
            description: `Opening ${providerLabel} authorization flow`,
            status: 'running',
            metadata: { provider: providerLabel },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Connecting ${providerLabel} calendar...`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        }),
      );
      push(unlistenCalendarAuthStarted);

      const unlistenCalendarConnected = await listen<string>(
        'calendar:connected',
        safeHandler('calendar:connected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `calendar-connected-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Calendar connected',
            description: `Connected calendar account ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Calendar connected',
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        }),
      );
      push(unlistenCalendarConnected);

      const unlistenCalendarDisconnected = await listen<string>(
        'calendar:disconnected',
        safeHandler('calendar:disconnected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `calendar-disconnected-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Calendar disconnected',
            description: `Disconnected calendar account ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Calendar disconnected',
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        }),
      );
      push(unlistenCalendarDisconnected);

      const unlistenCalendarEventCreated = await listen<Record<string, unknown>>(
        'calendar:event_created',
        safeHandler('calendar:event_created', (payload) => {
          const title = String(payload['title'] ?? payload['summary'] ?? 'Calendar event');
          const eventId = String(payload['id'] ?? payload['event_id'] ?? '');
          upsertActionLogEntry({
            id: `calendar-event-created-${eventId || Date.now().toString()}`,
            type: 'terminal',
            title: 'Calendar event created',
            description: title,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Created event: ${title}`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        }),
      );
      push(unlistenCalendarEventCreated);

      const unlistenCalendarEventUpdated = await listen<Record<string, unknown>>(
        'calendar:event_updated',
        safeHandler('calendar:event_updated', (payload) => {
          const title = String(payload['title'] ?? payload['summary'] ?? 'Calendar event');
          const eventId = String(payload['id'] ?? payload['event_id'] ?? '');
          upsertActionLogEntry({
            id: `calendar-event-updated-${eventId || Date.now().toString()}`,
            type: 'terminal',
            title: 'Calendar event updated',
            description: title,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Updated event: ${title}`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        }),
      );
      push(unlistenCalendarEventUpdated);

      const unlistenCalendarEventDeleted = await listen<Record<string, unknown>>(
        'calendar:event_deleted',
        safeHandler('calendar:event_deleted', (payload) => {
          const eventId = String(payload['event_id'] ?? payload['id'] ?? 'unknown');
          upsertActionLogEntry({
            id: `calendar-event-deleted-${eventId}-${Date.now()}`,
            type: 'terminal',
            title: 'Calendar event deleted',
            description: `Deleted calendar event ${eventId}`,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Deleted event ${eventId}`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        }),
      );
      push(unlistenCalendarEventDeleted);

      // Automation domain events -> unified action timeline
      const unlistenAutomationRecordingStarted = await listen<Record<string, unknown>>(
        'automation:recording_started',
        safeHandler('automation:recording_started', (payload) => {
          const sessionId = String(payload['session_id'] ?? payload['sessionId'] ?? 'unknown');
          upsertActionLogEntry({
            id: `automation-recording-started-${sessionId}`,
            actionId: sessionId,
            type: 'ui',
            title: 'Automation recording started',
            description: `Session ${sessionId}`,
            status: 'running',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: 'Automation recording started',
            fadeAfter: 3500,
          });
          focusSidecar('automation');
        }),
      );
      push(unlistenAutomationRecordingStarted);

      const unlistenAutomationActionRecorded = await listen<Record<string, unknown>>(
        'automation:action_recorded',
        safeHandler('automation:action_recorded', (payload) => {
          const actionType = String(payload['action_type'] ?? payload['actionType'] ?? 'action');
          const actionId = String(payload['id'] ?? crypto.randomUUID());
          upsertActionLogEntry({
            id: `automation-action-${actionId}`,
            actionId,
            type: 'ui',
            title: 'Automation action recorded',
            description: actionType.replace(/_/g, ' '),
            status: 'running',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Recorded action: ${actionType.replace(/_/g, ' ')}`,
            fadeAfter: 2500,
          });
          focusSidecar('automation');
        }),
      );
      push(unlistenAutomationActionRecorded);

      const unlistenAutomationRecordingStopped = await listen<Record<string, unknown>>(
        'automation:recording_stopped',
        safeHandler('automation:recording_stopped', (payload) => {
          const recordingId = String(payload['id'] ?? payload['recording_id'] ?? 'unknown');
          const actionCount = Number(payload['actions_count'] ?? payload['action_count'] ?? 0);
          upsertActionLogEntry({
            id: `automation-recording-stopped-${recordingId}`,
            actionId: recordingId,
            type: 'ui',
            title: 'Automation recording stopped',
            description:
              actionCount > 0
                ? `Captured ${actionCount} action${actionCount === 1 ? '' : 's'}`
                : `Recording ${recordingId} completed`,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message:
              actionCount > 0
                ? `Recording complete: ${actionCount} action${actionCount === 1 ? '' : 's'}`
                : 'Automation recording completed',
            fadeAfter: 3500,
          });
          focusSidecar('automation');
        }),
      );
      push(unlistenAutomationRecordingStopped);

      const unlistenAutomationScreenshotRequested = await listen<Record<string, unknown>>(
        'automation:request_screenshot',
        safeHandler('automation:request_screenshot', (payload) => {
          const actionId = String(payload['action_id'] ?? payload['actionId'] ?? 'unknown');
          upsertActionLogEntry({
            id: `automation-screenshot-${actionId}-${Date.now()}`,
            actionId,
            type: 'ui',
            title: 'Automation screenshot requested',
            description: 'Capturing UI state for automation step',
            status: 'running',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: 'Capturing automation screenshot...',
            fadeAfter: 3000,
          });
          focusSidecar('automation');
        }),
      );
      push(unlistenAutomationScreenshotRequested);

      // Cloud integration events -> unified action timeline
      const unlistenCloudAuthStarted = await listen<string>(
        'cloud:auth_started',
        safeHandler('cloud:auth_started', (provider) => {
          const providerLabel = String(provider || 'cloud').trim() || 'cloud';
          upsertActionLogEntry({
            id: `cloud-auth-${Date.now()}`,
            type: 'terminal',
            title: 'Cloud authorization started',
            description: `Opening ${providerLabel} authorization flow`,
            status: 'running',
            metadata: { provider: providerLabel },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Connecting ${providerLabel} cloud account...`,
            fadeAfter: 3500,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudAuthStarted);

      const unlistenCloudConnected = await listen<string>(
        'cloud:connected',
        safeHandler('cloud:connected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `cloud-connected-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Cloud account connected',
            description: `Connected account ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Cloud account connected',
            fadeAfter: 3500,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudConnected);

      const unlistenCloudDisconnected = await listen<string>(
        'cloud:disconnected',
        safeHandler('cloud:disconnected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `cloud-disconnected-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Cloud account disconnected',
            description: `Disconnected account ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Cloud account disconnected',
            fadeAfter: 3500,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudDisconnected);

      const unlistenCloudFileUploaded = await listen<Record<string, unknown>>(
        'cloud:file_uploaded',
        safeHandler('cloud:file_uploaded', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          upsertActionLogEntry({
            id: `cloud-file-uploaded-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud file uploaded',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Uploaded ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudFileUploaded);

      const unlistenCloudFileDownloaded = await listen<Record<string, unknown>>(
        'cloud:file_downloaded',
        safeHandler('cloud:file_downloaded', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          upsertActionLogEntry({
            id: `cloud-file-downloaded-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud file downloaded',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Downloaded ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudFileDownloaded);

      const unlistenCloudFileDeleted = await listen<Record<string, unknown>>(
        'cloud:file_deleted',
        safeHandler('cloud:file_deleted', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          upsertActionLogEntry({
            id: `cloud-file-deleted-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud file deleted',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Deleted ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudFileDeleted);

      const unlistenCloudFolderCreated = await listen<Record<string, unknown>>(
        'cloud:folder_created',
        safeHandler('cloud:folder_created', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'folder');
          upsertActionLogEntry({
            id: `cloud-folder-created-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud folder created',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Created folder ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        }),
      );
      push(unlistenCloudFolderCreated);

      // Gmail integration events -> unified action timeline
      const unlistenGmailAuthStarted = await listen<string>(
        'gmail:auth_started',
        safeHandler('gmail:auth_started', (oauthState) => {
          upsertActionLogEntry({
            id: `gmail-auth-${Date.now()}`,
            type: 'terminal',
            title: 'Gmail authorization started',
            description: 'Opening Gmail OAuth flow',
            status: 'running',
            metadata: { oauth_state: oauthState },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: 'Connecting Gmail account...',
            fadeAfter: 3500,
          });
          focusSidecar('gmail');
        }),
      );
      push(unlistenGmailAuthStarted);

      const unlistenGmailConnected = await listen<string>(
        'gmail:connected',
        safeHandler('gmail:connected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `gmail-connected-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Gmail connected',
            description: `Connected account ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Gmail connected',
            fadeAfter: 3500,
          });
          focusSidecar('gmail');
        }),
      );
      push(unlistenGmailConnected);

      const unlistenGmailTokenRefreshed = await listen<string>(
        'gmail:token_refreshed',
        safeHandler('gmail:token_refreshed', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `gmail-token-refreshed-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Gmail token refreshed',
            description: `Refreshed credentials for ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Gmail token refreshed',
            fadeAfter: 3000,
          });
          focusSidecar('gmail');
        }),
      );
      push(unlistenGmailTokenRefreshed);

      const unlistenGmailDisconnected = await listen<string>(
        'gmail:disconnected',
        safeHandler('gmail:disconnected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `gmail-disconnected-${normalizedAccountId}-${Date.now()}`,
            type: 'terminal',
            title: 'Gmail disconnected',
            description: `Disconnected account ${normalizedAccountId}`,
            status: 'success',
            metadata: { account_id: normalizedAccountId },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Gmail disconnected',
            fadeAfter: 3500,
          });
          focusSidecar('gmail');
        }),
      );
      push(unlistenGmailDisconnected);

      // MCP Tool Execution Events - show tool usage in action trail
      const unlistenMcpToolStarted = await listen<McpToolExecutionStartedPayload>(
        'mcp:tool_execution_started',
        (event) => {
          if (!isMountedRef.current) return;
          const { tool_id, server_name } = event.payload;
          const toolName = getMcpToolDisplayName(tool_id);

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
          const toolName = getMcpToolDisplayName(tool_id);

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
          const scheduleToolStreamCleanup = (toolId: string) => {
            const existingTimeout = toolStreamCleanupTimeoutsRef.current.get(toolId);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }
            // AUDIT-STREAM-053 fix: Reconcile message metadata before cleaning up tool stream
            // This ensures message artifacts reflect final status before stream is removed
            // AUDIT-UI-053 fix: Also update top-level message metadata status so fallback works correctly
            const timeoutId = setTimeout(() => {
              if (isMountedRef.current) {
                const state = useUnifiedChatStore.getState();
                const stream = state.activeToolStreams.get(toolId);

                // If there's a stream with a final status, find the message containing this tool's artifact
                // and update it to reflect final status before removing the stream
                if (stream) {
                  // Determine the final status - default to completed if still running
                  const finalStatus = stream.status === 'running' ? 'completed' : stream.status;

                  // Find message that has an artifact with this tool ID
                  const candidateMessages = (() => {
                    const activeMessages = resolveActiveConversationMessages();
                    return activeMessages.length > 0 ? activeMessages : state.messages;
                  })();
                  for (const message of candidateMessages) {
                    const artifacts = message.artifacts || [];
                    const artifactIndex = artifacts.findIndex((a) => a.id === toolId);
                    if (artifactIndex >= 0) {
                      const existingArtifact = artifacts[artifactIndex];
                      if (existingArtifact) {
                        const updatedArtifact = {
                          ...existingArtifact,
                          status: finalStatus,
                          success: finalStatus === 'completed',
                          error: stream.error,
                          metadata: {
                            ...existingArtifact.metadata,
                            completedAt: stream.completedAt?.toISOString(),
                            duration_ms: stream.duration_ms,
                            error: stream.error,
                            // Ensure status is not stuck in running
                            status: finalStatus,
                          },
                        };
                        const updatedArtifacts = [...artifacts];
                        updatedArtifacts[artifactIndex] = updatedArtifact;

                        // AUDIT-UI-053: Also update top-level message metadata status
                        // so the fallback in MessageBubble.tsx (line 249) works correctly
                        const currentMetadata = message.metadata || {};
                        state.updateMessage(message.id, {
                          artifacts: updatedArtifacts,
                          metadata: {
                            ...currentMetadata,
                            artifacts: updatedArtifacts,
                            status: finalStatus, // Update top-level status for fallback
                            state: finalStatus, // Also update state for other fallbacks
                          },
                        });
                      }
                      break; // Found and updated the message, no need to continue
                    }
                  }
                }

                handlersRef.current.removeToolStream(toolId);
              }
              toolStreamCleanupTimeoutsRef.current.delete(toolId);
            }, 5000);
            toolStreamCleanupTimeoutsRef.current.set(toolId, timeoutId);
          };

          const clearRunningActionTrailEntries = (toolId: string, toolName?: string) => {
            const state = useUnifiedChatStore.getState();
            const matches = state.actionTrail.filter((entry) => {
              if (entry.type !== 'running') return false;
              const metadataToolCallId = (entry.metadata as Record<string, unknown> | undefined)?.[
                'tool_call_id'
              ];
              if (metadataToolCallId === toolId) return true;
              if (!toolName) return false;
              return (
                entry.message === `Executing ${toolName}...` ||
                entry.message === `Calling ${toolName}...`
              );
            });

            for (const entry of matches) {
              state.removeActionTrailEntry(entry.id);
            }
          };

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

              upsertActionLogEntry({
                id: `toolstream-${startedEvent.tool_id}`,
                actionId: startedEvent.tool_id,
                type: mapToolNameToActionType(startedEvent.tool_name),
                title: `Execute ${startedEvent.tool_name}`,
                description: `Running ${startedEvent.tool_name}`,
                status: 'running',
                metadata: {
                  tool_name: startedEvent.tool_name,
                  parameters: startedEvent.parameters ?? null,
                  stream_started_at: timestamp,
                },
              });

              // Also update action trail for visibility
              const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
              addActionTrailEntry?.({
                type: 'running',
                message: `Executing ${startedEvent.tool_name}...`,
                metadata: { tool_call_id: startedEvent.tool_id },
              });

              if (startedEvent.tool_name.startsWith('extension_native_')) {
                runExtensionPreflightCheck();
                focusSidecar('browser');
              }
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

              // Also update action trail with progress message for real-time status
              if (progressEvent.message) {
                const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
                addActionTrailEntry?.({
                  type: 'running',
                  message: progressEvent.message,
                  metadata: { tool_call_id: progressEvent.tool_id },
                  fadeAfter: 2000,
                });
              }
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

              const toolName =
                useUnifiedChatStore.getState().activeToolStreams.get(completedEvent.tool_id)
                  ?.tool_name ?? 'tool';
              upsertActionLogEntry({
                id: `toolstream-${completedEvent.tool_id}`,
                actionId: completedEvent.tool_id,
                type: mapToolNameToActionType(toolName),
                title: `Execute ${toolName}`,
                description: `Completed in ${completedEvent.duration_ms}ms`,
                status: 'success',
                result: safeJsonStringify(completedEvent.result),
                metadata: {
                  tool_name: toolName,
                  duration_ms: completedEvent.duration_ms,
                  stream_completed_at: timestamp,
                },
              });

              // Update action trail
              const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
              const state = useUnifiedChatStore.getState();
              const stream = state.activeToolStreams.get(completedEvent.tool_id);
              clearRunningActionTrailEntries(completedEvent.tool_id, stream?.tool_name);
              addActionTrailEntry?.({
                type: 'completed',
                message: `${stream?.tool_name || 'Tool'} completed (${completedEvent.duration_ms}ms)`,
              });
              scheduleToolStreamCleanup(completedEvent.tool_id);
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

              const toolName =
                useUnifiedChatStore.getState().activeToolStreams.get(errorEvent.tool_id)
                  ?.tool_name ?? 'tool';
              upsertActionLogEntry({
                id: `toolstream-${errorEvent.tool_id}`,
                actionId: errorEvent.tool_id,
                type: mapToolNameToActionType(toolName),
                title: `Execute ${toolName}`,
                description: errorEvent.error,
                status: 'failed',
                error: errorEvent.error,
                metadata: {
                  tool_name: toolName,
                  duration_ms: errorEvent.duration_ms,
                  retryable: errorEvent.retryable,
                  stream_error_at: timestamp,
                },
              });

              // Update action trail
              const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
              const state = useUnifiedChatStore.getState();
              const stream = state.activeToolStreams.get(errorEvent.tool_id);
              clearRunningActionTrailEntries(errorEvent.tool_id, stream?.tool_name);
              addActionTrailEntry?.({
                type: 'error',
                message: `${stream?.tool_name || 'Tool'} failed: ${errorEvent.error}`,
              });
              scheduleToolStreamCleanup(errorEvent.tool_id);
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

              const toolName =
                useUnifiedChatStore.getState().activeToolStreams.get(cancelledEvent.tool_id)
                  ?.tool_name ?? 'tool';
              upsertActionLogEntry({
                id: `toolstream-${cancelledEvent.tool_id}`,
                actionId: cancelledEvent.tool_id,
                type: mapToolNameToActionType(toolName),
                title: `Execute ${toolName}`,
                description: cancelledEvent.reason ?? 'Tool execution cancelled',
                status: 'failed',
                error: cancelledEvent.reason ?? 'Tool execution cancelled',
                metadata: {
                  tool_name: toolName,
                  duration_ms: cancelledEvent.duration_ms,
                  stream_cancelled_at: timestamp,
                },
              });
              clearRunningActionTrailEntries(cancelledEvent.tool_id, toolName);
              scheduleToolStreamCleanup(cancelledEvent.tool_id);
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
    // Listener registration intentionally runs once; handlers access latest store via refs/getState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default useAgenticEvents;
