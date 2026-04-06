import { listen, UnlistenFn } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';
import { isTauri } from '../lib/tauri-mock';
import { automation, browserExtension } from '@agiworkforce/api';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  ActionLogStatus,
  FileOperation,
  Screenshot,
  TerminalCommand,
  ToolExecution,
} from '../stores/unifiedChatStore';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type {
  McpConnectionChangedPayload,
  McpServerUnhealthyPayload,
  McpSystemInitializedPayload,
  McpToolExecutionCompletedPayload,
  McpToolExecutionStartedPayload,
  McpToolsUpdatedPayload,
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
import { normalizeToolNameForUi } from '../lib/chatToolUtils';
import {
  getActiveConversationMessages,
  resolveActiveConversationMessageId,
} from '../lib/runtimeMessageOwnership';
import {
  buildMessageArtifactUpdate,
  getMergedMessageArtifacts,
  upsertMessageArtifact,
} from '../lib/messageArtifacts';
import {
  buildRuntimeActivityEmission,
  buildToolStreamCancelledActivity,
  buildToolStreamStartedActivity,
  buildToolStreamTerminalActivity,
} from '../lib/runtimeActivity';
import {
  buildOutputChunkToolStreamUpdate,
  buildProgressToolStreamUpdate,
  buildStartedToolStreamUpdate,
  buildTerminalToolStreamUpdate,
  clearRunningToolTrailEntries,
  normalizeToolTerminalArtifactStatus,
  reconcileToolArtifactTerminalState,
} from '../lib/toolStreamRuntime';

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
    setSidecarSectionFromEvent: useUnifiedChatStore.getState().setSidecarSectionFromEvent,
    // Tool streaming handlers
    updateToolStream: useUnifiedChatStore.getState().updateToolStream,
    removeToolStream: useUnifiedChatStore.getState().removeToolStream,
  });

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

  const emitRuntimeActivity = (activity: ReturnType<typeof buildRuntimeActivityEmission>) => {
    upsertActionLogEntry(activity.log);
    if (activity.trail) {
      useUnifiedChatStore.getState().addActionTrailEntry(activity.trail);
    }
    if (activity.sidecarEventType) {
      focusSidecar(activity.sidecarEventType);
    }
  };

  const runExtensionPreflightCheck = () => {
    if (extensionPreflightCheckedRef.current || !isTauri) {
      return;
    }
    extensionPreflightCheckedRef.current = true;

    void (async () => {
      try {
        const response =
          (await browserExtension.extensionStatus()) as ExtensionStatusDiagnosticsPayload;
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

  const resolveActiveConversationMessages = () => {
    return getActiveConversationMessages(useUnifiedChatStore.getState());
  };

  const resolveInlineExtensionTargetMessageId = (): string | null => {
    return resolveActiveConversationMessageId(useUnifiedChatStore.getState());
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
    const existingArtifact = artifacts.find((artifact) => artifact.id === artifactId) as
      | (Artifact & Record<string, unknown>)
      | undefined;
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

    const nextArtifacts = upsertMessageArtifact(targetMessage, nextArtifact);

    const metadataStatus = (nextArtifact as unknown as Record<string, unknown>)['status'];
    state.updateMessage(
      targetMessageId,
      buildMessageArtifactUpdate(targetMessage, nextArtifacts, {
        event: 'extension',
        sidecarType: 'browser',
        ...(typeof metadataStatus === 'string' ? { status: metadataStatus } : {}),
      }),
    );
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

      // automation:permission_required — show Sonner toast + auto-open System Settings
      const unlistenPermRequired = await listen<{
        reason: string;
        message: string;
        graceful?: boolean;
      }>('automation:permission_required', (event) => {
        if (!isMountedRef.current) return;
        const { message, reason, graceful } = event.payload;
        const openSettings = () => {
          void automation.requestAutomationPermission(reason ?? 'accessibility').catch((err) => {
            console.error('Failed to request automation permission:', err);
          });
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

      // Calendar domain events -> unified action timeline
      const unlistenCalendarAuthStarted = await listen<string>(
        'calendar:auth_started',
        safeHandler('calendar:auth_started', (provider) => {
          const providerLabel = String(provider || 'calendar').trim() || 'calendar';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `calendar-auth-${Date.now()}`,
              type: 'terminal',
              title: 'Calendar authorization started',
              description: `Opening ${providerLabel} authorization flow`,
              status: 'running',
              metadata: { provider: providerLabel },
              trail: {
                type: 'running',
                message: `Connecting ${providerLabel} calendar...`,
              },
              sidecarEventType: 'calendar',
            }),
          );
        }),
      );
      push(unlistenCalendarAuthStarted);

      const unlistenCalendarConnected = await listen<string>(
        'calendar:connected',
        safeHandler('calendar:connected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `calendar-connected-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Calendar connected',
              description: `Connected calendar account ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Calendar connected',
              },
              sidecarEventType: 'calendar',
            }),
          );
        }),
      );
      push(unlistenCalendarConnected);

      const unlistenCalendarDisconnected = await listen<string>(
        'calendar:disconnected',
        safeHandler('calendar:disconnected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `calendar-disconnected-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Calendar disconnected',
              description: `Disconnected calendar account ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Calendar disconnected',
              },
              sidecarEventType: 'calendar',
            }),
          );
        }),
      );
      push(unlistenCalendarDisconnected);

      const unlistenCalendarEventCreated = await listen<Record<string, unknown>>(
        'calendar:event_created',
        safeHandler('calendar:event_created', (payload) => {
          const title = String(payload['title'] ?? payload['summary'] ?? 'Calendar event');
          const eventId = String(payload['id'] ?? payload['event_id'] ?? '');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `calendar-event-created-${eventId || Date.now().toString()}`,
              type: 'terminal',
              title: 'Calendar event created',
              description: title,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Created event: ${title}`,
              },
              sidecarEventType: 'calendar',
            }),
          );
        }),
      );
      push(unlistenCalendarEventCreated);

      const unlistenCalendarEventUpdated = await listen<Record<string, unknown>>(
        'calendar:event_updated',
        safeHandler('calendar:event_updated', (payload) => {
          const title = String(payload['title'] ?? payload['summary'] ?? 'Calendar event');
          const eventId = String(payload['id'] ?? payload['event_id'] ?? '');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `calendar-event-updated-${eventId || Date.now().toString()}`,
              type: 'terminal',
              title: 'Calendar event updated',
              description: title,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Updated event: ${title}`,
              },
              sidecarEventType: 'calendar',
            }),
          );
        }),
      );
      push(unlistenCalendarEventUpdated);

      const unlistenCalendarEventDeleted = await listen<Record<string, unknown>>(
        'calendar:event_deleted',
        safeHandler('calendar:event_deleted', (payload) => {
          const eventId = String(payload['event_id'] ?? payload['id'] ?? 'unknown');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `calendar-event-deleted-${eventId}-${Date.now()}`,
              type: 'terminal',
              title: 'Calendar event deleted',
              description: `Deleted calendar event ${eventId}`,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Deleted event ${eventId}`,
              },
              sidecarEventType: 'calendar',
            }),
          );
        }),
      );
      push(unlistenCalendarEventDeleted);

      // Automation domain events -> unified action timeline
      const unlistenAutomationRecordingStarted = await listen<Record<string, unknown>>(
        'automation:recording_started',
        safeHandler('automation:recording_started', (payload) => {
          const sessionId = String(payload['session_id'] ?? payload['sessionId'] ?? 'unknown');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `automation-recording-started-${sessionId}`,
              actionId: sessionId,
              type: 'ui',
              title: 'Automation recording started',
              description: `Session ${sessionId}`,
              status: 'running',
              metadata: payload,
              trail: {
                type: 'running',
                message: 'Automation recording started',
              },
              sidecarEventType: 'automation',
            }),
          );
        }),
      );
      push(unlistenAutomationRecordingStarted);

      const unlistenAutomationActionRecorded = await listen<Record<string, unknown>>(
        'automation:action_recorded',
        safeHandler('automation:action_recorded', (payload) => {
          const actionType = String(payload['action_type'] ?? payload['actionType'] ?? 'action');
          const actionId = String(payload['id'] ?? crypto.randomUUID());
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `automation-action-${actionId}`,
              actionId,
              type: 'ui',
              title: 'Automation action recorded',
              description: actionType.replace(/_/g, ' '),
              status: 'running',
              metadata: payload,
              trail: {
                type: 'running',
                message: `Recorded action: ${actionType.replace(/_/g, ' ')}`,
                fadeAfter: 2500,
              },
              sidecarEventType: 'automation',
            }),
          );
        }),
      );
      push(unlistenAutomationActionRecorded);

      const unlistenAutomationRecordingStopped = await listen<Record<string, unknown>>(
        'automation:recording_stopped',
        safeHandler('automation:recording_stopped', (payload) => {
          const recordingId = String(payload['id'] ?? payload['recording_id'] ?? 'unknown');
          const actionCount = Number(payload['actions_count'] ?? payload['action_count'] ?? 0);
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
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
              trail: {
                type: 'completed',
                message:
                  actionCount > 0
                    ? `Recording complete: ${actionCount} action${actionCount === 1 ? '' : 's'}`
                    : 'Automation recording completed',
              },
              sidecarEventType: 'automation',
            }),
          );
        }),
      );
      push(unlistenAutomationRecordingStopped);

      const unlistenAutomationScreenshotRequested = await listen<Record<string, unknown>>(
        'automation:request_screenshot',
        safeHandler('automation:request_screenshot', (payload) => {
          const actionId = String(payload['action_id'] ?? payload['actionId'] ?? 'unknown');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `automation-screenshot-${actionId}-${Date.now()}`,
              actionId,
              type: 'ui',
              title: 'Automation screenshot requested',
              description: 'Capturing UI state for automation step',
              status: 'running',
              metadata: payload,
              trail: {
                type: 'running',
                message: 'Capturing automation screenshot...',
                fadeAfter: 3000,
              },
              sidecarEventType: 'automation',
            }),
          );
        }),
      );
      push(unlistenAutomationScreenshotRequested);

      // Cloud integration events -> unified action timeline
      const unlistenCloudAuthStarted = await listen<string>(
        'cloud:auth_started',
        safeHandler('cloud:auth_started', (provider) => {
          const providerLabel = String(provider || 'cloud').trim() || 'cloud';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-auth-${Date.now()}`,
              type: 'terminal',
              title: 'Cloud authorization started',
              description: `Opening ${providerLabel} authorization flow`,
              status: 'running',
              metadata: { provider: providerLabel },
              trail: {
                type: 'running',
                message: `Connecting ${providerLabel} cloud account...`,
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudAuthStarted);

      const unlistenCloudConnected = await listen<string>(
        'cloud:connected',
        safeHandler('cloud:connected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-connected-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Cloud account connected',
              description: `Connected account ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Cloud account connected',
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudConnected);

      const unlistenCloudDisconnected = await listen<string>(
        'cloud:disconnected',
        safeHandler('cloud:disconnected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-disconnected-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Cloud account disconnected',
              description: `Disconnected account ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Cloud account disconnected',
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudDisconnected);

      const unlistenCloudFileUploaded = await listen<Record<string, unknown>>(
        'cloud:file_uploaded',
        safeHandler('cloud:file_uploaded', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-file-uploaded-${Date.now()}`,
              type: 'filesystem',
              title: 'Cloud file uploaded',
              description: remotePath,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Uploaded ${remotePath}`,
                fadeAfter: 3000,
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudFileUploaded);

      const unlistenCloudFileDownloaded = await listen<Record<string, unknown>>(
        'cloud:file_downloaded',
        safeHandler('cloud:file_downloaded', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-file-downloaded-${Date.now()}`,
              type: 'filesystem',
              title: 'Cloud file downloaded',
              description: remotePath,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Downloaded ${remotePath}`,
                fadeAfter: 3000,
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudFileDownloaded);

      const unlistenCloudFileDeleted = await listen<Record<string, unknown>>(
        'cloud:file_deleted',
        safeHandler('cloud:file_deleted', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-file-deleted-${Date.now()}`,
              type: 'filesystem',
              title: 'Cloud file deleted',
              description: remotePath,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Deleted ${remotePath}`,
                fadeAfter: 3000,
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudFileDeleted);

      const unlistenCloudFolderCreated = await listen<Record<string, unknown>>(
        'cloud:folder_created',
        safeHandler('cloud:folder_created', (payload) => {
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'folder');
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `cloud-folder-created-${Date.now()}`,
              type: 'filesystem',
              title: 'Cloud folder created',
              description: remotePath,
              status: 'success',
              metadata: payload,
              trail: {
                type: 'completed',
                message: `Created folder ${remotePath}`,
                fadeAfter: 3000,
              },
              sidecarEventType: 'cloud',
            }),
          );
        }),
      );
      push(unlistenCloudFolderCreated);

      // Gmail integration events -> unified action timeline
      const unlistenGmailAuthStarted = await listen<string>(
        'gmail:auth_started',
        safeHandler('gmail:auth_started', (oauthState) => {
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `gmail-auth-${Date.now()}`,
              type: 'terminal',
              title: 'Gmail authorization started',
              description: 'Opening Gmail OAuth flow',
              status: 'running',
              metadata: { oauth_state: oauthState },
              trail: {
                type: 'running',
                message: 'Connecting Gmail account...',
              },
              sidecarEventType: 'gmail',
            }),
          );
        }),
      );
      push(unlistenGmailAuthStarted);

      const unlistenGmailConnected = await listen<string>(
        'gmail:connected',
        safeHandler('gmail:connected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `gmail-connected-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Gmail connected',
              description: `Connected account ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Gmail connected',
              },
              sidecarEventType: 'gmail',
            }),
          );
        }),
      );
      push(unlistenGmailConnected);

      const unlistenGmailTokenRefreshed = await listen<string>(
        'gmail:token_refreshed',
        safeHandler('gmail:token_refreshed', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `gmail-token-refreshed-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Gmail token refreshed',
              description: `Refreshed credentials for ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Gmail token refreshed',
                fadeAfter: 3000,
              },
              sidecarEventType: 'gmail',
            }),
          );
        }),
      );
      push(unlistenGmailTokenRefreshed);

      const unlistenGmailDisconnected = await listen<string>(
        'gmail:disconnected',
        safeHandler('gmail:disconnected', (accountId) => {
          const normalizedAccountId = String(accountId || '').trim() || 'unknown';
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `gmail-disconnected-${normalizedAccountId}-${Date.now()}`,
              type: 'terminal',
              title: 'Gmail disconnected',
              description: `Disconnected account ${normalizedAccountId}`,
              status: 'success',
              metadata: { account_id: normalizedAccountId },
              trail: {
                type: 'completed',
                message: 'Gmail disconnected',
              },
              sidecarEventType: 'gmail',
            }),
          );
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
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `mcp-${tool_id}-${Date.now()}`,
              actionId: tool_id,
              type: 'mcp',
              title: `Using ${toolName}`,
              description: `Executing MCP tool from ${server_name}`,
              status: 'running',
              metadata: { tool_id, server_name },
              trail: {
                type: 'running',
                message: `Using ${toolName}...`,
              },
              sidecarEventType: 'mcp',
            }),
          );
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
            emitRuntimeActivity(
              buildRuntimeActivityEmission({
                id: existingEntry.id,
                actionId: tool_id,
                type: existingEntry.type,
                title: existingEntry.title,
                description: success
                  ? `Completed in ${duration_ms}ms`
                  : `Failed after ${duration_ms}ms`,
                status: success ? 'success' : 'failed',
                metadata: { ...existingEntry.metadata, duration_ms, success },
                trail: {
                  type: success ? 'completed' : 'error',
                  message: success
                    ? `${toolName} completed (${duration_ms}ms)`
                    : `${toolName} failed`,
                },
              }),
            );
            return;
          }
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `mcp-${tool_id}-completed-${Date.now()}`,
              actionId: tool_id,
              type: 'mcp',
              title: `Using ${toolName}`,
              description: success
                ? `Completed in ${duration_ms}ms`
                : `Failed after ${duration_ms}ms`,
              status: success ? 'success' : 'failed',
              metadata: { tool_id, duration_ms, success },
              trail: {
                type: success ? 'completed' : 'error',
                message: success
                  ? `${toolName} completed (${duration_ms}ms)`
                  : `${toolName} failed`,
              },
            }),
          );
        },
      );
      push(unlistenMcpToolCompleted);

      const unlistenMcpConnection = await listen<McpConnectionChangedPayload>(
        'mcp:connection_changed',
        (event) => {
          if (!isMountedRef.current) return;
          const { server_name, connected, error } = event.payload;
          emitRuntimeActivity(
            buildRuntimeActivityEmission({
              id: `mcp-conn-${server_name}-${Date.now()}`,
              type: 'mcp',
              title: connected ? `Connected to ${server_name}` : `Disconnected from ${server_name}`,
              description:
                error ?? (connected ? 'MCP server connected' : 'MCP server disconnected'),
              status: connected ? 'success' : error ? 'failed' : 'success',
              metadata: { server_name, connected, error },
              trail: {
                type: connected ? 'completed' : error ? 'error' : 'completed',
                message: connected
                  ? `${server_name} connected`
                  : error
                    ? `${server_name} connection failed`
                    : `${server_name} disconnected`,
                fadeAfter: 3000,
              },
              sidecarEventType: 'mcp',
            }),
          );
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
                  const finalStatus = normalizeToolTerminalArtifactStatus(stream.status);

                  reconcileToolArtifactTerminalState(state, toolId, {
                    status: finalStatus,
                    reason: stream.error,
                    completedAt: stream.completedAt?.toISOString(),
                    durationMs: stream.duration_ms,
                    messageState: {
                      status: finalStatus,
                      state: finalStatus,
                    },
                  });
                }

                handlersRef.current.removeToolStream(toolId);
              }
              toolStreamCleanupTimeoutsRef.current.delete(toolId);
            }, 5000);
            toolStreamCleanupTimeoutsRef.current.set(toolId, timeoutId);
          };

          switch (streamEvent.type) {
            case 'started': {
              const startedEvent = streamEvent as ToolStreamStartedEvent;
              const decodedToolName = normalizeToolNameForUi(startedEvent.tool_name);
              handlersRef.current.updateToolStream(
                startedEvent.tool_id,
                buildStartedToolStreamUpdate({
                  toolId: startedEvent.tool_id,
                  toolName: decodedToolName,
                  timestamp,
                  parameters: startedEvent.parameters as Record<string, unknown> | undefined,
                }),
              );
              emitRuntimeActivity(
                buildToolStreamStartedActivity({
                  id: `toolstream-${startedEvent.tool_id}`,
                  actionId: startedEvent.tool_id,
                  type: mapToolNameToActionType(decodedToolName),
                  toolName: decodedToolName,
                  timestamp,
                  parameters: (startedEvent.parameters as Record<string, unknown>) ?? null,
                  sidecarEventType: startedEvent.tool_name.startsWith('extension_native_')
                    ? 'browser'
                    : undefined,
                }),
              );

              if (startedEvent.tool_name.startsWith('extension_native_')) {
                runExtensionPreflightCheck();
              }
              break;
            }

            case 'progress': {
              const progressEvent = streamEvent as ToolStreamProgressEvent;
              handlersRef.current.updateToolStream(
                progressEvent.tool_id,
                buildProgressToolStreamUpdate({
                  progress: progressEvent.progress,
                  message: progressEvent.message,
                  bytesProcessed: progressEvent.bytes_processed,
                  bytesTotal: progressEvent.bytes_total,
                }),
              );

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
              handlersRef.current.updateToolStream(
                chunkEvent.tool_id,
                buildOutputChunkToolStreamUpdate(chunkEvent.chunk),
              );
              break;
            }

            case 'completed': {
              const completedEvent = streamEvent as ToolStreamCompletedEvent;
              handlersRef.current.updateToolStream(
                completedEvent.tool_id,
                buildTerminalToolStreamUpdate({
                  status: 'completed',
                  timestamp,
                  durationMs: completedEvent.duration_ms,
                  result: completedEvent.result,
                }),
              );

              const toolName =
                useUnifiedChatStore.getState().activeToolStreams.get(completedEvent.tool_id)
                  ?.tool_name ?? 'tool';
              const state = useUnifiedChatStore.getState();
              const stream = state.activeToolStreams.get(completedEvent.tool_id);
              clearRunningToolTrailEntries(state, completedEvent.tool_id, stream?.tool_name);
              emitRuntimeActivity(
                buildToolStreamTerminalActivity({
                  id: `toolstream-${completedEvent.tool_id}`,
                  actionId: completedEvent.tool_id,
                  type: mapToolNameToActionType(toolName),
                  toolName: stream?.tool_name || 'Tool',
                  status: 'success',
                  timestamp,
                  durationMs: completedEvent.duration_ms,
                  result: safeJsonStringify(completedEvent.result),
                }),
              );
              scheduleToolStreamCleanup(completedEvent.tool_id);
              break;
            }

            case 'error': {
              const errorEvent = streamEvent as ToolStreamErrorEvent;
              handlersRef.current.updateToolStream(
                errorEvent.tool_id,
                buildTerminalToolStreamUpdate({
                  status: 'error',
                  timestamp,
                  durationMs: errorEvent.duration_ms,
                  error: errorEvent.error,
                  retryable: errorEvent.retryable,
                }),
              );

              const toolName =
                useUnifiedChatStore.getState().activeToolStreams.get(errorEvent.tool_id)
                  ?.tool_name ?? 'tool';
              const state = useUnifiedChatStore.getState();
              const stream = state.activeToolStreams.get(errorEvent.tool_id);
              clearRunningToolTrailEntries(state, errorEvent.tool_id, stream?.tool_name);
              emitRuntimeActivity(
                buildToolStreamTerminalActivity({
                  id: `toolstream-${errorEvent.tool_id}`,
                  actionId: errorEvent.tool_id,
                  type: mapToolNameToActionType(toolName),
                  toolName: stream?.tool_name || 'Tool',
                  status: 'failed',
                  timestamp,
                  durationMs: errorEvent.duration_ms,
                  error: errorEvent.error,
                  retryable: errorEvent.retryable,
                }),
              );
              scheduleToolStreamCleanup(errorEvent.tool_id);
              break;
            }

            case 'cancelled': {
              const cancelledEvent = streamEvent as ToolStreamCancelledEvent;
              handlersRef.current.updateToolStream(
                cancelledEvent.tool_id,
                buildTerminalToolStreamUpdate({
                  status: 'cancelled',
                  timestamp,
                  durationMs: cancelledEvent.duration_ms,
                  error: cancelledEvent.reason,
                }),
              );

              const toolName =
                useUnifiedChatStore.getState().activeToolStreams.get(cancelledEvent.tool_id)
                  ?.tool_name ?? 'tool';
              clearRunningToolTrailEntries(
                useUnifiedChatStore.getState(),
                cancelledEvent.tool_id,
                toolName,
              );
              emitRuntimeActivity(
                buildToolStreamCancelledActivity({
                  id: `toolstream-${cancelledEvent.tool_id}`,
                  actionId: cancelledEvent.tool_id,
                  type: mapToolNameToActionType(toolName),
                  toolName,
                  timestamp,
                  durationMs: cancelledEvent.duration_ms,
                  reason: cancelledEvent.reason,
                }),
              );
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

        const unlistenMcpServerUnhealthy = await listen<McpServerUnhealthyPayload>(
          'mcp:server_unhealthy',
          safeHandler('mcp:server_unhealthy', (payload) => {
            const mcpState = useMcpStore.getState();
            mcpState.upsertServerHealth({
              server_name: payload.server_name,
              status: payload.status,
              last_check: payload.last_check,
              error_message: payload.error_message ?? null,
              response_time_ms: payload.response_time_ms ?? null,
              tool_count: payload.tool_count ?? 0,
              consecutive_failures: payload.consecutive_failures ?? 0,
            });
            mcpState.refreshServers();
          }),
        );
        push(unlistenMcpServerUnhealthy);

        const unlistenMcpConnectionChanged = await listen<McpConnectionChangedPayload>(
          'mcp:connection_changed',
          safeHandler('mcp:connection_changed', () => {
            const mcpState = useMcpStore.getState();
            mcpState.refreshServers();
            mcpState.refreshHealth();
            mcpState.refreshStats();
          }),
        );
        push(unlistenMcpConnectionChanged);

        const unlistenMcpToolCompletedSync = await listen<McpToolExecutionCompletedPayload>(
          'mcp:tool_execution_completed',
          safeHandler('mcp:tool_execution_completed', () => {
            const mcpState = useMcpStore.getState();
            mcpState.refreshExecutionHistory();
            mcpState.refreshToolExecutionStats();
          }),
        );
        push(unlistenMcpToolCompletedSync);

        const unlistenMcpToolsUpdated = await listen<McpToolsUpdatedPayload>(
          'mcp:tools_updated',
          safeHandler('mcp:tools_updated', () => {
            const mcpState = useMcpStore.getState();
            mcpState.refreshTools();
            mcpState.refreshHealth();
            mcpState.refreshStats();
          }),
        );
        push(unlistenMcpToolsUpdated);

        const unlistenMcpSystemInitialized = await listen<McpSystemInitializedPayload>(
          'mcp:system_initialized',
          safeHandler('mcp:system_initialized', () => {
            useMcpStore.getState().refreshRuntimeTelemetry();
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
