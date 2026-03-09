/**
 * useToolEvents
 *
 * Listens to tool execution events:
 * - agi:tool_execution, agi:tool_stream
 * - mcp:tool_execution_started/completed, mcp:connection_changed
 * - tool:confirmation_required/timeout
 * - agi:approval_required/granted/denied, approval:request
 *
 * Extracted from useAgenticEvents.ts. Can be used independently by
 * components that only need tool execution state.
 */
import { listen, UnlistenFn } from '../lib/tauri-mock';
import { useEffect, useRef } from 'react';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  ApprovalRequest,
  ToolExecution,
  Screenshot,
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
import type { EnhancedMessage } from '../stores/chat/types';

// =============================================================================
// Shared utility types (passed in by the parent hook)
// =============================================================================

export interface ToolEventDeps {
  isMountedRef: React.MutableRefObject<boolean>;
  toolStreamCleanupTimeoutsRef: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>;
  upsertActionLogEntry: (
    entry: Partial<ActionLogEntry> & { id?: string; actionId?: string; type?: ActionLogEntryType },
  ) => void;
  normalizeRiskLevel: (risk?: string) => 'low' | 'medium' | 'high';
  mapToolNameToActionType: (toolName?: string) => ActionLogEntryType;
  getMcpToolDisplayName: (toolId: string) => string;
  safeJsonStringify: (value: unknown) => string | undefined;
  focusSidecar: (eventType: string) => void;
  resolveActiveConversationMessages: () => EnhancedMessage[];
  handlersRef: React.MutableRefObject<{
    addToolExecution: (execution: ToolExecution) => void;
    addScreenshot: (screenshot: Screenshot) => void;
    addApprovalRequest: (request: Omit<ApprovalRequest, 'status' | 'createdAt'>) => void;
    approveOperation: (id: string) => void;
    rejectOperation: (id: string, reason: string) => void;
    updateToolStream: (toolId: string, updates: Record<string, unknown>) => void;
    removeToolStream: (toolId: string) => void;
    updateActionLogEntry: (id: string, updates: Partial<ActionLogEntry>) => void;
  }>;
}

export interface ScreenshotEvent {
  screenshot: Screenshot;
  messageId?: string;
}

export interface ToolExecutionEvent {
  execution: ToolExecution;
  messageId?: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useToolEvents(deps: ToolEventDeps): void {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const {
    isMountedRef,
    toolStreamCleanupTimeoutsRef,
    upsertActionLogEntry,
    normalizeRiskLevel,
    mapToolNameToActionType,
    getMcpToolDisplayName,
    safeJsonStringify,
    focusSidecar,
    resolveActiveConversationMessages,
    handlersRef,
  } = deps;

  useEffect(() => {
    const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);

    const setup = async () => {
      if (!isMountedRef.current) return;

      // agi:tool_execution
      const unlistenToolExec = await listen<ToolExecutionEvent>('agi:tool_execution', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.addToolExecution(event.payload.execution);
        const exec = event.payload.execution as ToolExecution & {
          tool?: string;
          name?: string;
          type?: string;
        };
        const tool = exec.toolName ?? exec.tool ?? exec.name ?? exec.type ?? '';
        focusSidecar(tool || 'tool');
      });
      push(unlistenToolExec);

      // agi:screenshot
      const unlistenScreenshot = await listen<ScreenshotEvent>('agi:screenshot', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.addScreenshot(event.payload.screenshot);
      });
      push(unlistenScreenshot);

      // mcp:tool_execution_started
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
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({ type: 'running', message: `Using ${toolName}...` });
          focusSidecar('mcp');
        },
      );
      push(unlistenMcpToolStarted);

      // mcp:tool_execution_completed
      const unlistenMcpToolCompleted = await listen<McpToolExecutionCompletedPayload>(
        'mcp:tool_execution_completed',
        (event) => {
          if (!isMountedRef.current) return;
          const { tool_id, success, duration_ms } = event.payload;
          const toolName = getMcpToolDisplayName(tool_id);
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
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: success ? 'completed' : 'error',
            message: success ? `${toolName} completed (${duration_ms}ms)` : `${toolName} failed`,
          });
        },
      );
      push(unlistenMcpToolCompleted);

      // mcp:connection_changed
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

      // tool:confirmation_required
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
            timeoutSeconds: 120,
          });
          focusSidecar('approval');
        },
      );
      push(unlistenToolConfirmation);

      // tool:confirmation_timeout
      const unlistenToolTimeout = await listen<{ request_id: string }>(
        'tool:confirmation_timeout',
        (event) => {
          if (!isMountedRef.current) return;
          const { request_id } = event.payload;
          handlersRef.current.rejectOperation(request_id, 'Operation timed out');
        },
      );
      push(unlistenToolTimeout);

      // agi:approval_required
      interface ApprovalRequestPayload {
        id: string;
        type?: string;
        description?: string;
        riskLevel?: string;
        details?: Record<string, unknown>;
        impact?: string;
      }

      const unlistenApprovalRequired = await listen<{ approval: ApprovalRequest }>(
        'agi:approval_required',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.addApprovalRequest(event.payload.approval);
        },
      );
      push(unlistenApprovalRequired);

      // approval:request
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
            riskLevel: normalizeRiskLevel(event.payload.riskLevel),
            details: event.payload.details || {},
            impact: event.payload.impact,
          };
          handlersRef.current.addApprovalRequest(approval);
        },
      );
      push(unlistenApprovalRequest);

      // agi:approval_granted
      const unlistenApprovalGranted = await listen<{ approval: ApprovalRequest }>(
        'agi:approval_granted',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.approveOperation(event.payload.approval.id);
        },
      );
      push(unlistenApprovalGranted);

      // agi:approval_denied
      const unlistenApprovalDenied = await listen<{
        approval: ApprovalRequest & { rejection_reason?: string };
      }>('agi:approval_denied', (event) => {
        if (!isMountedRef.current) return;
        const approval = event.payload.approval as typeof event.payload.approval & {
          rejection_reason?: string;
        };
        const reason = approval.rejectionReason ?? approval.rejection_reason ?? 'Approval denied';
        handlersRef.current.rejectOperation(approval.id, reason);
      });
      push(unlistenApprovalDenied);

      // agi:tool_stream
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
            const timeoutId = setTimeout(() => {
              if (isMountedRef.current) {
                const state = useUnifiedChatStore.getState();
                const stream = state.activeToolStreams.get(toolId);
                if (stream) {
                  const finalStatus = stream.status === 'running' ? 'completed' : stream.status;
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
                            status: finalStatus,
                          },
                        };
                        const updatedArtifacts = [...artifacts];
                        updatedArtifacts[artifactIndex] = updatedArtifact;
                        const currentMetadata = message.metadata || {};
                        state.updateMessage(message.id, {
                          artifacts: updatedArtifacts,
                          metadata: {
                            ...currentMetadata,
                            artifacts: updatedArtifacts,
                            status: finalStatus,
                            state: finalStatus,
                          },
                        });
                      }
                      break;
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
                startedAt: new Date(timestamp),
                progress: 0,
              });
              upsertActionLogEntry({
                id: `toolstream-${startedEvent.tool_id}`,
                actionId: startedEvent.tool_id,
                type: mapToolNameToActionType(startedEvent.tool_name),
                title: `Execute ${startedEvent.tool_name}`,
                description: 'Starting...',
                status: 'running',
                metadata: {
                  tool_name: startedEvent.tool_name,
                  stream_started_at: timestamp,
                },
              });
              const addTrail = useUnifiedChatStore.getState().addActionTrailEntry;
              addTrail?.({
                type: 'running',
                message: `Executing ${startedEvent.tool_name}...`,
                metadata: { tool_call_id: startedEvent.tool_id },
              });
              break;
            }

            case 'progress': {
              const progressEvent = streamEvent as ToolStreamProgressEvent;
              handlersRef.current.updateToolStream(progressEvent.tool_id, {
                progress: progressEvent.progress,
                status: 'running',
                outputBuffer: progressEvent.message,
              });
              if (progressEvent.message) {
                const addTrail = useUnifiedChatStore.getState().addActionTrailEntry;
                addTrail?.({
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
              const addTrail = useUnifiedChatStore.getState().addActionTrailEntry;
              const streamState = useUnifiedChatStore
                .getState()
                .activeToolStreams.get(completedEvent.tool_id);
              clearRunningActionTrailEntries(completedEvent.tool_id, streamState?.tool_name);
              addTrail?.({
                type: 'completed',
                message: `${streamState?.tool_name || 'Tool'} completed (${completedEvent.duration_ms}ms)`,
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
              const addTrail = useUnifiedChatStore.getState().addActionTrailEntry;
              const streamState = useUnifiedChatStore
                .getState()
                .activeToolStreams.get(errorEvent.tool_id);
              clearRunningActionTrailEntries(errorEvent.tool_id, streamState?.tool_name);
              addTrail?.({
                type: 'error',
                message: `${streamState?.tool_name || 'Tool'} failed: ${errorEvent.error}`,
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
    };

    setup().catch((error) => {
      console.error('[useToolEvents] Failed to setup listeners:', error);
    });

    return () => {
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
      // Clear any pending tool stream cleanup timeouts to prevent post-unmount
      // state mutations when this hook is used standalone (not via useAgenticEvents).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeouts = toolStreamCleanupTimeoutsRef.current;
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useToolEvents;
