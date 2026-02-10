/**
 * Unified Agentic Chat
 *
 * The main container component for the AGI chat interface.
 * Orchestrates:
 * - Message stream and history
 * - Sidecars (Terminal, Browser, etc.)
 * - Input area and command palette
 * - Approval workflows
 * - Layout management (sidebar, main content, sidecar)
 */
import { invoke, listen } from '../../lib/tauri-mock';
import React, { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAgenticEvents } from '../../hooks/useAgenticEvents';
import { useSlashCommands } from '../../hooks/useSlashCommands';
import { sha256 } from '../../lib/hash';
import { deriveTaskMetadata } from '../../lib/taskMetadata';
import { getModelForRequest } from '../../lib/modelRouter';
import { getModelMetadata } from '../../constants/llm';
import { useBillingUsageStore, selectBudget } from '../../stores/billingUsage';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUnifiedChatStore, type SidecarMode, uuidToDbId } from '../../stores/unifiedChatStore';
import { useBillingStore } from '../../stores/auth';
import { useCustomInstructionsStore } from '../../stores/customInstructionsStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useProjectStore } from '../../stores/projectStore';
import { supabaseAuth } from '../../services/supabaseAuth';
import type { Artifact, ResearchTask } from '../../types/chat';
import { useSimpleModeStore } from '../../stores/ui';
import { formatErrorForChat } from '../../lib/friendlyErrors';
import { toast } from '../../hooks/useToast';
import { refreshCreditsAfterMessage } from '../../hooks/useCreditRefresh';
import { CanvasWorkspace } from '../Canvas';
import { ChatErrorBoundary } from '../ErrorBoundary';
import { AppLayout } from './AppLayout';
import { ApprovalModal } from './ApprovalModal';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ActiveToolStreams } from './Cards/ActiveToolStreams';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { ChatStream } from './ChatStream';
import { ProjectsView } from './ProjectsView';
import { RiskConfirmationDialog, useRiskConfirmation } from './RiskConfirmationDialog';
import { BackgroundTaskIndicator } from '../BackgroundTasks';
import {
  executeTerminalCommand,
  executeBrowserCommand,
  executeCodeCommand,
  executeDatabaseCommand,
  executeUndoCommand,
} from '../../handlers/slashCommandHandlers';
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const toolNameToArtifactType = (toolName: string): Artifact['type'] => {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('image') || normalized.includes('video')) return 'image';
  if (normalized.includes('document') || normalized.includes('pdf') || normalized.includes('word'))
    return 'document';
  if (normalized.includes('excel') || normalized.includes('sheet') || normalized.includes('table'))
    return 'spreadsheet';
  return 'code';
};

const toolNameToTitle = (toolName: string): string =>
  toolName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeInlineToolData = (
  toolName: string,
  rawData: Record<string, unknown>,
): Record<string, unknown> => {
  const normalizedTool = toolName.toLowerCase();
  const data = { ...rawData };

  if (normalizedTool.includes('image')) {
    const images = Array.isArray(data['images']) ? data['images'] : [];
    data['images'] = images.map((image) => {
      if (image && typeof image === 'object') {
        const img = image as Record<string, unknown>;
        return {
          ...img,
          base64: (img['base64'] as string | undefined) ?? (img['b64_json'] as string | undefined),
        };
      }
      return image;
    });
  }

  if (normalizedTool.includes('video')) {
    data['videoUrl'] =
      (data['videoUrl'] as string | undefined) ?? (data['video_url'] as string | undefined);
    data['duration'] =
      (data['duration'] as number | undefined) ?? (data['duration_secs'] as number | undefined);
  }

  if (normalizedTool.includes('document')) {
    data['filePath'] =
      (data['filePath'] as string | undefined) ??
      (data['file_path'] as string | undefined) ??
      (data['output_path'] as string | undefined);
    data['downloadUrl'] =
      (data['downloadUrl'] as string | undefined) ?? (data['download_url'] as string | undefined);
  }

  return data;
};

/**
 * Wrapper component that shows active tool streams above the chat input
 * Shows running streams and recently completed/errored streams for visibility
 */
const ActiveToolStreamsDisplay: React.FC = () => {
  const activeToolStreams = useUnifiedChatStore((state) => state.activeToolStreams);
  const [tick, setTick] = React.useState(0);

  // Refresh visibility check every second to handle completed stream expiration
  React.useEffect(() => {
    const hasCompletedStreams = Array.from(activeToolStreams.values()).some(
      (s) => s.status === 'completed' || s.status === 'error',
    );

    if (!hasCompletedStreams) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeToolStreams]);

  // Get running streams and recently completed/errored streams (within 3 seconds)
  // tick is included to trigger recalculation when interval fires
  const visibleStreams = React.useMemo(() => {
    // Use tick to force recalculation
    void tick;
    const now = Date.now();
    const streams = Array.from(activeToolStreams.values());
    return streams.filter((s) => {
      if (s.status === 'running') return true;
      // Show completed/errored streams for 3 seconds after completion
      if ((s.status === 'completed' || s.status === 'error') && s.completedAt) {
        const completedTime = new Date(s.completedAt).getTime();
        return now - completedTime < 3000;
      }
      return false;
    });
  }, [activeToolStreams, tick]);

  // Don't render if no visible streams
  if (visibleStreams.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-gray-800 bg-gray-900/50 px-4 py-2">
      <ActiveToolStreams showCompleted={true} maxStreams={3} />
    </div>
  );
};

export const UnifiedAgenticChat: React.FC<{
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  defaultSidecarOpen?: boolean;
  onSendMessage?: (content: string, options: SendOptions) => Promise<void>;
  onOpenSettings?: () => void;
}> = ({
  className = '',
  layout = 'default',
  defaultSidecarOpen = true,
  onSendMessage,
  onOpenSettings,
}) => {
  // CHT-008 fix: Consolidated selectors to reduce subscription overhead
  // Using useShallow for object selections prevents unnecessary re-renders
  const {
    setSidecarOpen,
    openSidecar: openSidecarStore,
    addMessage,
    updateMessage,
    setIsLoading,
    setStreamingMessage,
    conversationMode,
    messages,
    activeView,
    setWorkflowContext,
  } = useUnifiedChatStore(
    useShallow((state) => ({
      setSidecarOpen: state.setSidecarOpen,
      openSidecar: state.openSidecar,
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      setIsLoading: state.setIsLoading,
      setStreamingMessage: state.setStreamingMessage,
      conversationMode: state.conversationMode,
      messages: state.messages,
      activeView: state.activeView,
      setWorkflowContext: state.setWorkflowContext,
    })),
  );

  // CHT-008 fix: Consolidated settings and model store selectors
  const llmConfig = useSettingsStore(useShallow((state) => state.llmConfig));
  const { selectedProvider, selectedModel } = useModelStore(
    useShallow((state) => ({
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
    })),
  );

  // CHT-008 fix: Consolidated billing store selectors
  const budget = useBillingUsageStore(selectBudget);
  const { addTokenUsage, loadCostOverview: loadOverview } = useBillingUsageStore(
    useShallow((state) => ({
      addTokenUsage: state.addTokenUsage,
      loadCostOverview: state.loadCostOverview,
    })),
  );
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to store unlisten functions for synchronous cleanup
  // Note: Unlisten can return void or Promise<void> depending on the event type
  const unlistenFnsRef = useRef<Array<() => void | Promise<void>>>([]);
  const isMountedRef = useRef(true);

  // CHT-005 fix: Track active stream sessions to prevent race conditions
  // Maps conversation_id to the message_id being streamed for that conversation
  const activeStreamSessionsRef = useRef<Map<number, string>>(new Map());

  // CHT-003 fix: Custom confirmation dialog to replace window.confirm()
  const {
    state: riskConfirmState,
    confirm: confirmRisk,
    handleConfirm: handleRiskConfirm,
    handleCancel: handleRiskCancel,
  } = useRiskConfirmation();

  useAgenticEvents();

  // Initialize slash command parsing
  const { parseSlashCommand } = useSlashCommands();

  useEffect(() => {
    if (!isTauri) return;

    isMountedRef.current = true;
    // Clear any stale unlisten functions from previous render
    unlistenFnsRef.current = [];

    const setupListeners = async () => {
      // Helper to register unlisten functions as promises resolve
      const registerListener = async (listenerPromise: Promise<() => void>) => {
        try {
          const unlisten = await listenerPromise;
          if (isMountedRef.current) {
            unlistenFnsRef.current.push(unlisten);
          } else {
            // Component unmounted while setting up, clean up immediately
            unlisten();
          }
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to setup listener:', error);
        }
      };

      const resolveStreamTargetMessageId = (
        conversationId: number,
        payloadMessageId?: string | number,
      ): string | null => {
        const state = useUnifiedChatStore.getState();
        const sessionMessageId = activeStreamSessionsRef.current.get(conversationId);
        const normalizedPayloadId =
          payloadMessageId === undefined || payloadMessageId === null
            ? null
            : String(payloadMessageId);

        if (sessionMessageId && state.messages.some((m) => m.id === sessionMessageId)) {
          return sessionMessageId;
        }
        if (normalizedPayloadId && state.messages.some((m) => m.id === normalizedPayloadId)) {
          return normalizedPayloadId;
        }
        if (
          state.currentStreamingMessageId &&
          state.messages.some((m) => m.id === state.currentStreamingMessageId)
        ) {
          return state.currentStreamingMessageId;
        }
        return null;
      };

      const upsertToolArtifact = (
        conversationId: number,
        toolCallId: string,
        patch: Record<string, unknown>,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessageId = resolveStreamTargetMessageId(conversationId);
        if (!targetMessageId) return;

        const targetMessage = state.messages.find((msg) => msg.id === targetMessageId);
        if (!targetMessage) return;

        const baseArtifacts = [
          ...(targetMessage.artifacts || []),
          ...(((targetMessage.metadata?.artifacts as Artifact[] | undefined) || []).filter(
            (artifact) =>
              !targetMessage.artifacts?.some(
                (existing) => existing.id === artifact.id || existing.content === artifact.content,
              ),
          ) as Artifact[]),
        ] as Artifact[];

        const index = baseArtifacts.findIndex((artifact) => artifact.id === toolCallId);
        const existing = index >= 0 ? baseArtifacts[index] : null;
        const patchToolName = String(
          patch['toolName'] || (existing as Record<string, unknown> | null)?.['toolName'] || 'code',
        );
        const patchContent = String(
          patch['content'] || (existing as Record<string, unknown> | null)?.['content'] || '',
        );
        const nextArtifact = {
          id: toolCallId,
          type: toolNameToArtifactType(patchToolName),
          title: toolNameToTitle(patchToolName),
          content: patchContent,
          ...existing,
          ...patch,
        };

        const nextArtifacts =
          index >= 0
            ? baseArtifacts.map((artifact, i) => (i === index ? nextArtifact : artifact))
            : [...baseArtifacts, nextArtifact];

        state.updateMessage(targetMessageId, {
          artifacts: nextArtifacts as Artifact[],
          metadata: {
            artifacts: nextArtifacts as Artifact[],
          },
        });
      };

      registerListener(
        listen<{ conversation_id: number; message_id: string | number; created_at: string }>(
          'chat:stream-start',
          ({ payload }) => {
            if (!isMountedRef.current) return;
            console.log('[UnifiedAgenticChat] Stream started:', payload);

            // Create new AbortController for this streaming session
            // This allows handleStopGeneration to cancel the current stream
            abortControllerRef.current = new AbortController();

            // CHT-005 fix: Register this stream session with conversation-to-message mapping
            // This prevents race conditions when multiple streams are active
            const messageId = String(payload.message_id);
            activeStreamSessionsRef.current.set(payload.conversation_id, messageId);
            console.log(
              `[UnifiedAgenticChat] CHT-005: Registered stream session conv=${payload.conversation_id} msg=${messageId}`,
            );

            // Stream has started, but we keep isLoading true until stream-end
            // This allows the UI to show streaming state
            useUnifiedChatStore.getState().setIsLoading(true);
          },
        ),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id: string | number;
          delta: string;
          content: string;
        }>('chat:stream-chunk', ({ payload }) => {
          const state = useUnifiedChatStore.getState();

          // Validate payload has required fields
          if (!payload.message_id || typeof payload.content !== 'string') {
            console.error('[UnifiedAgenticChat] Invalid stream payload', { payload });
            return;
          }

          // Handle both string (UUID) and number (backend ID) message IDs
          const targetMessageId = String(payload.message_id);

          // CHT-005 fix: Use the stream session mapping to find the correct target
          // This is the authoritative source for which message should receive updates
          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);

          // Priority 1: Use the session-tracked message ID (most reliable)
          if (sessionMessageId && state.messages.some((m) => m.id === sessionMessageId)) {
            state.updateMessage(sessionMessageId, {
              content: payload.content,
              metadata: { streaming: true },
            });
            return;
          }

          // Priority 2: Use the payload message_id if it exists in messages
          const messageExists = state.messages.some((m) => m.id === targetMessageId);
          if (messageExists) {
            state.updateMessage(targetMessageId, {
              content: payload.content,
              metadata: { streaming: true },
            });
            return;
          }

          // Priority 3: Fallback to currentStreamingMessageId
          const currentStreamingId = state.currentStreamingMessageId;
          if (currentStreamingId && state.messages.some((m) => m.id === currentStreamingId)) {
            console.warn(
              `[UnifiedAgenticChat] CHT-005: Using fallback currentStreamingId (session: ${sessionMessageId}, payload: ${targetMessageId}, current: ${currentStreamingId})`,
            );
            state.updateMessage(currentStreamingId, {
              content: payload.content,
              metadata: { streaming: true },
            });
            return;
          }

          // Last resort: find any streaming assistant message (should rarely happen)
          const lastStreaming = state.messages
            .filter((m) => m.role === 'assistant' && m.metadata?.streaming)
            .pop();

          if (lastStreaming) {
            console.warn(
              `[UnifiedAgenticChat] CHT-005: Using last-resort streaming message ${lastStreaming.id}`,
            );
            state.updateMessage(lastStreaming.id, {
              content: payload.content,
              metadata: { streaming: true },
            });
          } else {
            console.error('[UnifiedAgenticChat] CHT-005: No streaming message found to update.', {
              payloadMessageId: payload.message_id,
              sessionMessageId,
              currentStreamingId: state.currentStreamingMessageId,
              availableMessageIds: state.messages.map((m) => m.id),
            });
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id: string | number;
          backend_message_id?: number;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
          credits?: {
            cost_cents: number;
            remaining_cents: number;
            daily_limit?: number;
            daily_used?: number;
            daily_remaining?: number;
            daily_reset_at?: string;
          };
        }>('chat:stream-end', ({ payload }) => {
          const state = useUnifiedChatStore.getState();
          const messageId = String(payload.message_id);
          const currentStreamingId = state.currentStreamingMessageId;

          // CHT-005 fix: Use session tracking for reliable message identification
          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);

          // Determine target message ID with priority: session > payload > fallback
          let targetId: string | null = null;
          if (sessionMessageId && state.messages.some((m) => m.id === sessionMessageId)) {
            targetId = sessionMessageId;
          } else if (state.messages.some((m) => m.id === messageId)) {
            targetId = messageId;
          } else if (
            currentStreamingId &&
            state.messages.some((m) => m.id === currentStreamingId)
          ) {
            targetId = currentStreamingId;
          }

          if (targetId) {
            state.updateMessage(targetId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
          }

          // CHT-005 fix: Clean up stream session tracking
          activeStreamSessionsRef.current.delete(payload.conversation_id);
          console.log(
            `[UnifiedAgenticChat] CHT-005: Cleaned up stream session for conv=${payload.conversation_id}`,
          );

          // Update billing store with new credit info
          if (payload.credits) {
            useBillingStore.getState().updateCredits(payload.credits);
            console.log('[UnifiedAgenticChat] Updated credits from stream-end:', payload.credits);
          }

          // Clear the abort controller since streaming completed
          abortControllerRef.current = null;

          state.setIsLoading(false);
          state.setStreamingMessage(null);
        }),
      );

      // Listen for stream errors
      registerListener(
        listen<{ conversation_id: number; message_id: string | number; error: string }>(
          'chat:stream-error',
          ({ payload }) => {
            const state = useUnifiedChatStore.getState();
            const messageId = String(payload.message_id);
            const currentStreamingId = state.currentStreamingMessageId;

            // CHT-005 fix: Use session tracking for reliable message identification
            const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);

            // Determine target message ID with priority: session > payload > fallback
            let targetId: string | null = null;
            if (sessionMessageId && state.messages.some((m) => m.id === sessionMessageId)) {
              targetId = sessionMessageId;
            } else if (state.messages.some((m) => m.id === messageId)) {
              targetId = messageId;
            } else if (
              currentStreamingId &&
              state.messages.some((m) => m.id === currentStreamingId)
            ) {
              targetId = currentStreamingId;
            }

            if (targetId) {
              // Use friendly error messages in simple mode
              const isSimpleMode = useSimpleModeStore.getState().mode === 'simple';
              const displayError = isSimpleMode
                ? formatErrorForChat(payload.error, true)
                : `Error: ${payload.error}`;

              state.updateMessage(targetId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
            }

            // CHT-005 fix: Clean up stream session tracking on error
            activeStreamSessionsRef.current.delete(payload.conversation_id);
            console.log(
              `[UnifiedAgenticChat] CHT-005: Cleaned up stream session on error for conv=${payload.conversation_id}`,
            );

            // Clear the abort controller since streaming errored
            abortControllerRef.current = null;

            state.setIsLoading(false);
            state.setStreamingMessage(null);
          },
        ),
      );

      // Pending message event listeners
      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            console.log('[UnifiedAgenticChat] Pending message added:', payload);
            useUnifiedChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            console.log('[UnifiedAgenticChat] Pending message consumed:', payload);
            useUnifiedChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Pending messages cleared:', payload);
          useUnifiedChatStore.getState().clearPendingMessages();
        }),
      );

      registerListener(
        listen<{
          pending_messages: Array<{ id: string; content: string }>;
          current_tool?: string;
          current_phase?: string;
          count: number;
        }>('chat:pending-context-available', ({ payload }) => {
          console.log(
            '[UnifiedAgenticChat] Pending context available (%s):',
            payload.current_tool || payload.current_phase || 'unknown',
            payload.pending_messages.map((m) => m.content.slice(0, 50)),
          );
          // This event is informational - the AI can use pending messages to adjust behavior
          // The messages are already in the store, so we don't need to do anything here
        }),
      );

      // Listen for pending messages ready to be processed after stream ends
      registerListener(
        listen<{
          conversation_id: number;
          pending_messages: Array<{ id: string; content: string; timestamp: string }>;
          count: number;
        }>('chat:pending-messages-ready', async ({ payload }) => {
          console.log(
            '[UnifiedAgenticChat] Pending messages ready for processing:',
            payload.count,
            'messages',
          );

          // Auto-process pending messages by sending them as follow-up
          // This creates a seamless experience where queued messages are automatically sent
          // Process messages sequentially with delays to avoid race conditions
          for (let i = 0; i < payload.pending_messages.length; i++) {
            // Check if component is still mounted before processing each message
            if (!isMountedRef.current) {
              console.log(
                '[UnifiedAgenticChat] Component unmounted, stopping pending message processing',
              );
              break;
            }

            const pending = payload.pending_messages[i];
            if (!pending) continue;

            console.log(
              '[UnifiedAgenticChat] Processing pending message:',
              pending.content.slice(0, 50),
            );

            // Remove from pending queue in store
            useUnifiedChatStore.getState().removePendingMessage(pending.id);

            // Clear from backend queue
            try {
              await invoke('chat_pop_pending_message');
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to pop pending message:', err);
              // CHT-002 fix: Show user-visible error for pending message processing failure
              toast({
                variant: 'destructive',
                title: 'Failed to process queued message. Please try again.',
              });
              // AUDIT-005-010 fix: Abort processing this message on pop failure to prevent inconsistent state
              continue;
            }

            // Actually send the pending message as a follow-up
            // Add delay between messages to avoid race conditions
            if (i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              // Dispatch a custom event that ChatInputArea listens to for auto-send
              window.dispatchEvent(
                new CustomEvent('chat:auto-send-pending', {
                  detail: { content: pending.content, pendingId: pending.id },
                }),
              );
            } catch (err) {
              console.error('[UnifiedAgenticChat] Failed to send pending message:', err);
              // CHT-002 fix: Show user-visible error for pending message send failure
              toast({
                variant: 'destructive',
                title: 'Failed to send queued message. Please try again.',
              });
            }
          }

          // Notify user that pending messages have been processed
          if (payload.count > 0) {
            console.log(
              '[UnifiedAgenticChat] All pending messages have been queued for processing',
            );
          }
        }),
      );

      // Listen for agent thinking state
      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
            console.log('[UnifiedAgenticChat] Agent thinking:', payload);
            // Update action trail with thinking status
            if (payload.thinking) {
              useUnifiedChatStore.getState().addActionTrailEntry({
                type: 'thinking',
                message: payload.message || payload.phase || 'Thinking...',
                fadeAfter: 30000, // Fade after 30 seconds if not cleared
              });
            }
          },
        ),
      );

      // Listen for agent finished state
      registerListener(
        listen<{
          agent_id?: string;
          success: boolean;
          result?: string;
          error?: string;
          duration_ms?: number;
        }>('agent:finished', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Agent finished:', payload);
          // Update action trail with completion status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? payload.result || 'Task completed successfully'
              : payload.error || 'Task failed',
            fadeAfter: 5000, // Fade after 5 seconds
            metadata: { duration_ms: payload.duration_ms },
          });

          // Clear any running agent status
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && (!payload.agent_id || currentAgent.id === payload.agent_id)) {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              status: payload.success ? 'completed' : 'failed',
              completedAt: new Date(),
              error: payload.error,
            });
          }
        }),
      );

      // Tool execution event listeners - display tool calls in the UI
      registerListener(
        listen<{
          conversation_id: number;
          tool_calls: Array<{
            index: number;
            id: string;
            name: string;
            arguments: string;
          }>;
          streaming: boolean;
        }>('chat:tool-calls', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Tool calls detected:', payload.tool_calls.length);

          // CHT-009 fix: Update message metadata so MessageBubble renders the ToolCallCard
          // Find the target message
          const state = useUnifiedChatStore.getState();
          // Try session map first, then payload message_id if available (though tool-calls payload doesn't have message_id?)
          // Wait, payload doesn't have message_id! It has conversation_id.
          // We must rely on activeStreamSessionsRef or finding the last assistant message.

          let targetMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);

          if (!targetMessageId) {
            // Fallback: find the last streaming assistant message
            const lastStreaming = state.messages
              .filter((m) => m.role === 'assistant' && m.metadata?.streaming)
              .pop();
            if (lastStreaming) targetMessageId = lastStreaming.id;
          }

          // If we found a target message, update its metadata
          if (targetMessageId) {
            const firstTool = payload.tool_calls[0];
            if (firstTool) {
              console.log(
                `[UnifiedAgenticChat] Updating message ${targetMessageId} with tool metadata:`,
                firstTool.name,
              );
              state.updateMessage(targetMessageId, {
                metadata: {
                  // key fields for MessageBubble to detect tool call
                  tool: firstTool.name,
                  tool_call: firstTool.id,
                  name: firstTool.name,
                  status: 'running',
                  // also keep streaming true so it shows as active
                  streaming: true,
                },
              });
            }
          }

          // Add to action trail to show which tools are being called
          for (const tc of payload.tool_calls) {
            let parsedArguments: Record<string, unknown> = {};
            try {
              parsedArguments = tc.arguments
                ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                : {};
            } catch {
              // Keep fallback empty object if arguments are partial/non-JSON.
            }

            upsertToolArtifact(payload.conversation_id, tc.id, {
              toolName: tc.name, // Use 'toolName' consistently with upsertToolArtifact logic
              type: toolNameToArtifactType(tc.name),
              title: toolNameToTitle(tc.name),
              status: 'running',
              content: '',
              ...(parsedArguments['prompt'] ? { prompt: parsedArguments['prompt'] } : {}),
              ...(parsedArguments['output_path']
                ? { filePath: parsedArguments['output_path'] }
                : {}),
              ...(parsedArguments['file_path'] ? { filePath: parsedArguments['file_path'] } : {}),
            });

            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `Calling ${tc.name}...`,
              metadata: { tool_call_id: tc.id, arguments: tc.arguments },
            });
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          tool_call_id: string;
          tool_name: string;
          arguments: string;
        }>('chat:tool-executing', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Tool executing:', payload.tool_name);
          // Update action trail with executing status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Executing ${payload.tool_name}...`,
            metadata: { tool_call_id: payload.tool_call_id },
          });
        }),
      );

      // Listen for agent progress events (iteration tracking for OpenClaw-style runs)
      registerListener(
        listen<{
          conversation_id: number;
          iteration: number;
          max_iterations: number;
          status: string;
          tool_count?: number;
        }>('chat:agent-progress', ({ payload }) => {
          console.log(
            `[UnifiedAgenticChat] Agent progress: iteration ${payload.iteration}/${payload.max_iterations} (${payload.status})`,
          );
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.status === 'limit_reached' ? 'error' : 'running',
            message:
              payload.status === 'limit_reached'
                ? `Agent reached iteration limit (${payload.max_iterations})`
                : `Agent iteration ${payload.iteration}/${payload.max_iterations}${payload.tool_count ? ` — ${payload.tool_count} tool(s)` : ''}`,
          });
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          tool_call_id: string;
          tool_name: string;
          success: boolean;
          result: string;
          result_data?: Record<string, unknown>;
        }>('chat:tool-result', ({ payload }) => {
          console.log(
            '[UnifiedAgenticChat] Tool result:',
            payload.tool_name,
            payload.success ? 'succeeded' : 'failed',
          );

          let parsedData: Record<string, unknown> = payload.result_data || {};
          if (!payload.result_data && payload.result) {
            try {
              const parsed = JSON.parse(payload.result);
              if (parsed && typeof parsed === 'object') {
                parsedData = parsed as Record<string, unknown>;
              }
            } catch {
              // Keep preview-only mode when result payload is truncated text.
            }
          }

          const normalizedData = normalizeInlineToolData(payload.tool_name, parsedData);
          upsertToolArtifact(payload.conversation_id, payload.tool_call_id, {
            toolName: payload.tool_name,
            type: toolNameToArtifactType(payload.tool_name),
            title: toolNameToTitle(payload.tool_name),
            status: payload.success ? 'completed' : 'failed',
            success: payload.success,
            error: payload.success ? undefined : payload.result,
            content: payload.result || '',
            ...normalizedData,
          });

          // Update action trail with result
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? `${payload.tool_name} completed`
              : `${payload.tool_name} failed`,
            metadata: { tool_call_id: payload.tool_call_id, result_preview: payload.result },
            fadeAfter: 3000,
          });
        }),
      );

      // Deep Research event listeners
      registerListener(
        listen<{
          task_id: string;
          step_id: string;
          step_index: number;
          description: string;
        }>('research:step_started', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research step started:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            // Update the step status
            const updatedSteps = task.steps.map((step, index) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return { ...step, status: 'running' as const, timestamp: Date.now() };
              }
              return step;
            });
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress: Math.round((payload.step_index / task.steps.length) * 100),
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          step_id: string;
          step_index: number;
          success: boolean;
          details?: string;
        }>('research:step_completed', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research step completed:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step, index) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return {
                  ...step,
                  status: payload.success ? ('completed' as const) : ('failed' as const),
                  details: payload.details,
                };
              }
              return step;
            });
            const completedCount = updatedSteps.filter((s) => s.status === 'completed').length;
            executionStore.updateResearchTask(payload.task_id, {
              steps: updatedSteps,
              progress: Math.round((completedCount / task.steps.length) * 100),
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          finding: string;
        }>('research:finding_added', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research finding added:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              findings: [...task.findings, payload.finding],
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          source: { title: string; url: string; domain?: string };
        }>('research:source_added', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research source added:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              sources: [...task.sources, payload.source],
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          success: boolean;
          time_elapsed?: string;
        }>('research:completed', ({ payload }) => {
          console.log('[UnifiedAgenticChat] Research completed:', payload);
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step) => ({
              ...step,
              status: payload.success ? ('completed' as const) : step.status,
            }));
            executionStore.updateResearchTask(payload.task_id, {
              status: payload.success ? 'completed' : 'failed',
              progress: 100,
              steps: updatedSteps,
              timeElapsed: payload.time_elapsed,
            });
          }
        }),
      );

      registerListener(
        listen<{
          task_id: string;
          time_elapsed: string;
        }>('research:progress', ({ payload }) => {
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            executionStore.updateResearchTask(payload.task_id, {
              timeElapsed: payload.time_elapsed,
            });
          }
        }),
      );
    };

    // Start setting up listeners
    setupListeners().catch((error) => {
      console.error('[UnifiedAgenticChat] Failed to setup listeners:', error);
    });

    // Capture ref values inside the effect for safe cleanup
    const activeStreamSessions = activeStreamSessionsRef.current;

    return () => {
      // Mark as unmounted first to prevent new registrations
      isMountedRef.current = false;

      // Abort any active streaming to prevent background work after unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Clear stale stream session tracking
      activeStreamSessions.clear();

      // Clean up all registered listeners - handle both sync and async unlisten functions
      // Some Tauri listeners may return promises that need to be caught to avoid unhandled rejections
      const listeners = [...unlistenFnsRef.current];
      unlistenFnsRef.current = [];

      listeners.forEach((unlisten) => {
        try {
          const result = unlisten();
          // Handle async unlisten functions that return promises
          if (result && typeof result === 'object' && 'catch' in result) {
            (result as Promise<void>).catch((error) => {
              // Suppress "listeners[eventId].handleId" errors - these occur when
              // the event system is cleaning up during component unmount
              if (!String(error).includes('listeners[eventId]')) {
                console.warn('[UnifiedAgenticChat] Async listener cleanup warning:', error);
              }
            });
          }
        } catch (error) {
          // Suppress the specific Tauri internal error during cleanup
          if (!String(error).includes('listeners[eventId]')) {
            console.error('[UnifiedAgenticChat] Error during listener cleanup:', error);
          }
        }
      });
    };
    // AUDIT-005-014 fix: Remove stable store actions from dependency array
    // updateMessage and setStreamingMessage are stable zustand actions that don't change
    // Including them causes unnecessary re-registrations of event listeners
  }, []);

  useEffect(() => {
    if (defaultSidecarOpen === false) {
      setSidecarOpen(false);
    }
  }, [defaultSidecarOpen, setSidecarOpen]);

  useEffect(() => {
    if (!budget.enabled) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const messageId = String(lastMessage.id ?? crypto.randomUUID());
    if (countedMessageIdsRef.current.has(messageId)) {
      return;
    }
    const tokens =
      lastMessage.metadata?.tokenCount ?? Math.ceil((lastMessage.content?.length ?? 0) * 0.25);
    addTokenUsage(tokens);
    countedMessageIdsRef.current.add(messageId);
  }, [messages, budget.enabled, addTokenUsage]);

  const fallbackProvider = llmConfig.defaultProvider;
  const providerForMessage = selectedProvider ?? fallbackProvider ?? undefined;
  // For subscription-only model, defaultModels only has managed_cloud and ollama
  const defaultModels = llmConfig.defaultModels as Record<string, string>;
  const fallbackModelForProvider =
    providerForMessage && llmConfig.defaultModels
      ? (defaultModels[providerForMessage] ?? 'auto')
      : undefined;
  const modelForMessage = selectedModel ?? fallbackModelForProvider ?? undefined;

  useEffect(() => {
    void loadOverview().catch((err) =>
      console.error('[UnifiedAgenticChat] Failed to load cost overview', err),
    );
  }, [loadOverview]);

  // Validate slash command arguments for safety
  const validateSlashCommandArgs = (command: string, args: string): boolean => {
    // Maximum argument length
    const MAX_ARGS_LENGTH = 2000;
    if (args.length > MAX_ARGS_LENGTH) {
      return false;
    }

    switch (command) {
      case 'terminal':
        // Terminal commands shouldn't contain shell metacharacters in certain positions
        if (/[;|&`$(){}[\]\\]/.test(args) && /\b(rm|del|format|shutdown|poweroff)\b/i.test(args)) {
          return false; // Reject dangerous combinations
        }
        break;

      case 'browser':
        // Browser URLs should be relatively safe but check for injection
        if (args.includes('\n') || args.includes('\r')) {
          return false; // No newlines in URLs
        }
        break;

      case 'code':
        // Code arguments should not be excessively large (prevent memory issues)
        if (args.length > 5000) {
          return false;
        }
        break;

      case 'database':
        // Database queries should not be excessively long
        if (args.length > 3000) {
          return false;
        }
        break;
    }

    return true;
  };

  const handleSendMessage = async (content: string, options: SendOptions) => {
    // Handle slash commands
    const slashCommand = parseSlashCommand(content);

    if (slashCommand) {
      // Validate command arguments first
      if (!validateSlashCommandArgs(slashCommand.command, slashCommand.args)) {
        const userMessageId = addMessage({
          role: 'user',
          content: slashCommand.rawInput,
          slashCommand,
          inlinePanels: [],
        });

        updateMessage(userMessageId, {
          content: `Error: Invalid or suspicious arguments for /${slashCommand.command}. Arguments may be too long or contain dangerous patterns.`,
          metadata: { streaming: false },
        });
        return;
      }

      // Create user message with slash command metadata
      const userMessageId = addMessage({
        role: 'user',
        content: slashCommand.rawInput,
        slashCommand,
        inlinePanels: [],
      });

      try {
        // Execute the appropriate command handler
        let panel;
        switch (slashCommand.command) {
          case 'browser':
            panel = await executeBrowserCommand(slashCommand.args);
            break;
          case 'terminal':
            panel = await executeTerminalCommand(slashCommand.args, userMessageId);
            break;
          case 'code':
            panel = await executeCodeCommand(slashCommand.args);
            break;
          case 'database':
            panel = await executeDatabaseCommand(slashCommand.args);
            break;
          case 'undo':
            panel = await executeUndoCommand(slashCommand.args);
            break;
          default:
            throw new Error(`Unknown command: ${slashCommand.command}`);
        }

        // Add the inline panel to the message
        useUnifiedChatStore.getState().addInlinePanel(userMessageId, panel);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateMessage(userMessageId, {
          error: errorMessage,
        });
      }
      return;
    }

    const editingMessageId = useUnifiedChatStore.getState().editingMessageId;
    if (editingMessageId) {
      const currentMessages = useUnifiedChatStore.getState().messages;
      const editIndex = currentMessages.findIndex((m) => m.id === editingMessageId);
      if (editIndex !== -1) {
        const newMessages = currentMessages.slice(0, editIndex);
        useUnifiedChatStore.setState({ messages: newMessages });
      }

      useUnifiedChatStore.getState().cancelEditing();
    }

    // Use intelligent model router for auto modes
    // This replaces the old local classifyTask and applyRouting functions
    const hasImages = options.attachments?.some((a) => a.type === 'image') ?? false;
    const currentModel = options.modelOverride ?? selectedModel ?? 'auto';

    // Check if user explicitly selected a specific model (not an auto mode)
    // User's explicit model selection should ALWAYS be respected over routing.
    // Only use intelligent routing when:
    // 1. User has selected "auto" mode (auto-economy, auto-balanced, auto-premium, or legacy 'auto')
    // 2. No explicit model override was provided
    const isExplicitModelSelection = currentModel !== 'auto' && !currentModel.startsWith('auto-');

    // Only perform routing if user selected an auto mode
    const routingResult = isExplicitModelSelection
      ? { modelId: currentModel, reason: `User selected: ${currentModel}`, wasRouted: false }
      : getModelForRequest(currentModel, content, hasImages);

    // Log routing decision for debugging
    if (routingResult.wasRouted) {
      console.log('[UnifiedAgenticChat] Model router decision:', {
        originalModel: currentModel,
        routedModel: routingResult.modelId,
        reason: routingResult.reason,
      });
    } else if (isExplicitModelSelection) {
      console.log('[UnifiedAgenticChat] Using explicit model selection:', currentModel);
    }

    // Risk detection runs in ALL modes - dangerous patterns should always be flagged
    // The undo-based safety philosophy handles reversibility AFTER actions, but we still
    // need upfront detection to warn users about potentially dangerous requests.
    const dangerousCommandPatterns = [
      /\b(rm|del|erase|format|diskpart|fdisk|wipe)\b/i,
      /\b(shutdown|poweroff|reboot|halt)\b/i,
      /(disable|disallow|stop|kill)\s+(antivirus|firewall|defender|av)/i,
      /\b(registry\s+delete|regedit|reg\s+delete)\b/i,
      /taskkill\s+\/f/i,
      /\b(dd|shred)\b.*if=/i,
    ];

    // Shell operators and redirection that could be dangerous with command injection
    const dangerousOperatorPatterns = [/[;&|`$(){}[\]\\]/];

    // Prompt injection patterns
    const promptInjectionPatterns = [
      /ignore\s+(previous\s+)?instructions/i,
      /override\s+(system\s+)?prompt/i,
      /system\s+prompt|system\s+message/i,
      /forget\s+(everything|previous)/i,
      /roleplay\s+as\s+(?!the assistant)/i,
    ];

    const lower = content.toLowerCase();
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    let matchedRisk: string | null = null;

    // Check for dangerous commands (high risk)
    for (const pattern of dangerousCommandPatterns) {
      if (pattern.test(lower)) {
        riskLevel = 'high';
        matchedRisk = pattern.source;
        break;
      }
    }

    // Check for prompt injection (medium risk)
    if (riskLevel === 'low') {
      for (const pattern of promptInjectionPatterns) {
        if (pattern.test(lower)) {
          riskLevel = 'medium';
          matchedRisk = pattern.source;
          break;
        }
      }
    }

    // Check for shell operators combined with commands (medium risk)
    if (riskLevel === 'low' && dangerousOperatorPatterns[0]!.test(content)) {
      if (/\b(execute|run|system|shell|cmd|command|bash|sh|powershell)\b/i.test(lower)) {
        riskLevel = 'medium';
        matchedRisk = 'Shell operators with execution keywords';
      }
    }

    if (riskLevel !== 'low') {
      // In auto mode, use stronger warning language since AGI operates autonomously
      const modeContext =
        conversationMode === 'auto'
          ? ' AGI Workforce will execute this autonomously without step-by-step approval.'
          : '';

      const riskMessage =
        riskLevel === 'high'
          ? `This request contains a HIGH-RISK instruction that could cause system damage: ${matchedRisk}.${modeContext} This is not recommended.`
          : `This request may contain a potential security risk: ${matchedRisk}.${modeContext} Proceed with caution.`;

      // CHT-003 fix: Use custom dialog instead of window.confirm()
      const confirmed = await confirmRisk(riskLevel as 'medium' | 'high', riskMessage);
      if (!confirmed) {
        return;
      }
    }

    // Use the routed model from intelligent router
    // If routing occurred, use the routed model. Otherwise use the original selection.
    const enrichedOptions: SendOptions = {
      ...options,
      providerOverride: options.providerOverride ?? providerForMessage ?? llmConfig.defaultProvider,
      // Use routed model if routing occurred, otherwise use the explicit model override
      modelOverride: routingResult.wasRouted
        ? routingResult.modelId
        : (options.modelOverride ?? modelForMessage ?? defaultModels[llmConfig.defaultProvider]),
    };

    const entryPoint = content.trim();
    const workflowHash = await sha256(entryPoint || crypto.randomUUID());
    setWorkflowContext({
      hash: workflowHash,
      description: entryPoint,
      entryPoint,
    });
    if (isTauri) {
      try {
        await invoke('agent_set_workflow_hash', { workflow_hash: workflowHash });
      } catch (error) {
        console.error('[UnifiedAgenticChat] Failed to set workflow hash', error);
      }
    }

    const taskMetadata = deriveTaskMetadata(entryPoint, enrichedOptions.attachments);

    addMessage({ role: 'user', content, attachments: enrichedOptions.attachments });

    // Handle deep-research focus mode: create research task and set special metadata
    const isDeepResearchMode = enrichedOptions.focusMode === 'deep-research';
    let researchTaskId: string | undefined;

    if (isDeepResearchMode) {
      // Generate a unique task ID for the research task
      researchTaskId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Create initial research task in ExecutionStore
      const initialResearchTask: ResearchTask = {
        id: researchTaskId,
        query: content,
        progress: 0,
        status: 'running',
        steps: [
          {
            id: `${researchTaskId}-step-1`,
            description: 'Analyzing query and planning research strategy',
            status: 'running',
            timestamp: Date.now(),
          },
          {
            id: `${researchTaskId}-step-2`,
            description: 'Searching for relevant sources',
            status: 'pending',
          },
          {
            id: `${researchTaskId}-step-3`,
            description: 'Extracting key information',
            status: 'pending',
          },
          {
            id: `${researchTaskId}-step-4`,
            description: 'Synthesizing findings',
            status: 'pending',
          },
          {
            id: `${researchTaskId}-step-5`,
            description: 'Compiling final report',
            status: 'pending',
          },
        ],
        findings: [],
        sources: [],
        timeElapsed: '0s',
      };

      useExecutionStore.getState().addResearchTask(initialResearchTask);
    }

    // Create assistant message with loading placeholder (fixes empty message display)
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '', // Will be populated by streaming chunks
      metadata: {
        streaming: true,
        ...(isDeepResearchMode && {
          type: 'deep-research-task',
          taskId: researchTaskId,
        }),
      },
    });

    setIsLoading(true);
    setStreamingMessage(assistantMessageId);

    try {
      if (onSendMessage) {
        await onSendMessage(content, enrichedOptions);
      } else {
        // Resolve conversation ID for stateful chat
        const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
        const conversationDbId = activeConversationId
          ? uuidToDbId(activeConversationId)
          : undefined;

        // All LLM requests use cloud credits from subscription (except Ollama local)
        // For streaming mode, we pass the frontend message ID and don't wait for the response
        // Events will handle all updates
        const userId = supabaseAuth.getUser()?.id;
        if (!userId) {
          throw new Error('User not authenticated');
        }

        // Get merged custom instructions (project > conversation > global)
        const conversationInstructions = useUnifiedChatStore
          .getState()
          .getConversationCustomInstructions(activeConversationId ?? undefined);
        const mergedCustomInstructions = useCustomInstructionsStore
          .getState()
          .getMergedInstructions(conversationInstructions);

        // Check if always use agent mode is enabled in settings
        const alwaysUseAgentMode =
          useSettingsStore.getState().chatPreferences.alwaysUseAgentMode ?? false;

        // Get current project folder for scoped file operations
        const currentProjectFolder = useProjectStore.getState().currentFolder;

        // Nudge user to select a project folder when sending file-related messages
        if (!currentProjectFolder) {
          const fileKeywords =
            /\b(file|folder|directory|read|write|edit|create|delete|save|open|path|code|project|src|component)\b/i;
          if (fileKeywords.test(content)) {
            toast({
              variant: 'default',
              title: 'No project folder selected',
              description:
                'Select a project folder (top-right folder icon) so the AI can access your files. Without it, file operations may fail.',
              duration: 8000,
            });
          }
        }

        // Look up model capabilities to help backend filter tools appropriately
        const effectiveModel = enrichedOptions.modelOverride || selectedModel || 'auto';
        const modelMeta = getModelMetadata(effectiveModel);
        const modelCapabilities = modelMeta?.capabilities ?? undefined;

        interface ChatSendMessageResponse {
          conversation?: { id: number };
          message?: { id: number; content: string };
          credits?: {
            remaining_cents: number;
            daily_used?: number;
            daily_limit?: number;
            daily_reset_at?: string;
          };
        }
        const response = await invoke<ChatSendMessageResponse>('chat_send_message', {
          request: {
            content,
            userId,
            conversation_id: conversationDbId,
            attachments: enrichedOptions.attachments?.map((att) => ({
              id: att.id,
              type: att.type,
              name: att.name,
              mimeType: att.mimeType,
              content: att.content,
            })),
            providerOverride: enrichedOptions.providerOverride,
            modelOverride: enrichedOptions.modelOverride,
            focusMode: enrichedOptions.focusMode,
            stream: true,
            enableTools: true,
            conversationMode,
            taskMetadata,
            thinkingMode: useModelStore.getState().thinkingModeEnabled,
            preferCloudCredits: true,
            frontendMessageId: assistantMessageId, // Pass frontend message ID for event coordination
            customInstructions: mergedCustomInstructions || undefined, // Include merged custom instructions
            // Pass research task ID for deep research mode
            researchTaskId: isDeepResearchMode ? researchTaskId : undefined,
            // Force agent mode if user has enabled "always use agent mode" setting
            enableAgentMode: alwaysUseAgentMode ? true : undefined,
            // Project folder for scoped file operations (like Claude Code)
            projectFolder: currentProjectFolder || undefined,
            // Model capabilities for tool filtering (Phase 6)
            modelCapabilities: modelCapabilities || undefined,
          },
        });

        // Link backend ID to frontend UUID (if conversation was created)
        if (response.conversation?.id && activeConversationId) {
          useUnifiedChatStore
            .getState()
            .linkConversationId(activeConversationId, response.conversation.id);
        }

        // For streaming mode, we don't update from the response
        // All updates come from events (chat:stream-chunk, chat:stream-end, etc.)
        // The response is just an acknowledgment that streaming started
        // setIsLoading will be set to false by the chat:stream-end event handler

        // However, for non-streaming fallback or future mixed modes, we check for credits here too
        if (response.credits) {
          console.log('[UnifiedAgenticChat] Updated credits from response:', response.credits);
          useBillingStore.getState().updateCredits(response.credits);
        }

        // Trigger a credit refresh after message is sent to update UI with fresh balance
        // This helps users see their remaining credits in near real-time
        void refreshCreditsAfterMessage();
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isSimpleMode = useSimpleModeStore.getState().mode === 'simple';

      // In simple mode, use friendly error messages
      if (isSimpleMode) {
        const userMessage = formatErrorForChat(errorMessage, true);
        updateMessage(assistantMessageId, {
          content: userMessage,
          metadata: { streaming: false },
          error: errorMessage,
        });
      } else {
        // Parse backend standardized error codes for advanced mode
        let userMessage = `Error: ${errorMessage}`;

        if (errorMessage.includes('[ERR_BILLING_QUOTA]')) {
          const detail =
            errorMessage.split('[ERR_BILLING_QUOTA]')[1]?.trim() || 'Insufficient credits.';
          userMessage = `⚠️ **Payment Required**\n\n${detail}\n\nPlease check your plan limits in the Settings or upgrade to continue.`;
        } else if (errorMessage.includes('[ERR_AUTH_INVALID]')) {
          userMessage = `🔒 **Authentication Failed**\n\nWe couldn't verify your credentials. Please sign out and sign in again to refresh your session.`;
        } else if (errorMessage.includes('[ERR_RATE_LIMIT]')) {
          userMessage = `⏳ **Rate Limit Exceeded**\n\nYou are sending requests too quickly. Please wait a moment before trying again.`;
        } else if (errorMessage.includes('[ERR_NETWORK_TIMEOUT]')) {
          userMessage = `📡 **Network Timeout**\n\nThe request timed out. Please check your connection and try again.`;
        } else if (errorMessage.includes('[ERR_PROVIDER_ERROR]')) {
          const detail =
            errorMessage.split('[ERR_PROVIDER_ERROR]')[1]?.trim() || 'Unknown provider error.';
          userMessage = `❌ **Provider Error**\n\n${detail}`;
        } else {
          // Legacy fallback
          if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
            userMessage +=
              '\n\nAuthentication failed. Please check your subscription status or contact support if the issue persists.';
          } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            userMessage += "\n\nYou've hit a rate limit. Please try again in a few moments.";
          } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            userMessage +=
              '\n\nThe request timed out. Please check your internet connection and try again.';
          } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
            userMessage += '\n\nNetwork error. Please check your internet connection.';
          } else if (errorMessage.includes('invalid') || errorMessage.includes('validation')) {
            userMessage +=
              '\n\nThe request was invalid. This may be due to unsupported content or format.';
          } else {
            userMessage +=
              '\n\nPlease check your internet connection and try again. If the issue persists, contact support.';
          }
        }

        updateMessage(assistantMessageId, {
          content: userMessage,
          metadata: { streaming: false },
          error: errorMessage,
        });
      }
      // Clean up loading state on error - for successful streaming, chat:stream-end handles this
      setIsLoading(false);
      setStreamingMessage(null);
    }
    // Note: No finally block - for streaming mode, cleanup is handled by chat:stream-end event handler
  };

  const layoutClasses = {
    default: '',
    compact: '',
    immersive: '',
  };

  const handleStopGeneration = async () => {
    console.log('[UnifiedAgenticChat] Stopping generation...');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (isTauri) {
      try {
        await invoke('chat_stop_generation');
      } catch (error) {
        console.warn('[UnifiedAgenticChat] Failed to stop generation:', error);
      }
    }

    const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
    if (currentStreamingId) {
      updateMessage(currentStreamingId, {
        metadata: { streaming: false },
      });
    }

    setIsLoading(false);
    setStreamingMessage(null);
  };

  const openSidecar = (panel: SidecarMode, payload?: Record<string, unknown>) => {
    openSidecarStore(panel, payload?.['contextId'] as string | undefined, payload);
  };

  // CHT-001 fix: Wrap entire chat interface with error boundary to prevent crashes
  return (
    <ChatErrorBoundary>
      <div
        className={`unified-agentic-chat relative flex h-full min-h-0 flex-col overflow-hidden bg-[#05060b] ${layoutClasses[layout]} ${className}`}
      >
        <AppLayout onOpenSettings={onOpenSettings}>
          {activeView === 'chat' ? (
            <>
              {/* Header bar with background task indicator */}
              <div className="flex items-center justify-end px-4 py-2 border-b border-gray-800/50">
                <BackgroundTaskIndicator
                  popoverSide="bottom"
                  popoverAlign="end"
                  panelMaxHeight="350px"
                />
              </div>
              <BudgetAlertsPanel />
              <ChatStream
                onOpenSidecar={openSidecar}
                onSuggestionClick={(prompt) => {
                  useUnifiedChatStore.getState().setDraftContent(prompt + ' ');
                }}
              />
              {/* Real-time tool execution progress display */}
              <ActiveToolStreamsDisplay />
              <ChatInputArea onSend={handleSendMessage} onStopGeneration={handleStopGeneration} />
            </>
          ) : activeView === 'projects' ? (
            <ProjectsView />
          ) : activeView === 'artifacts' ? (
            <div className="flex-1 p-4">
              <CanvasWorkspace className="h-full" />
            </div>
          ) : null}
        </AppLayout>

        <ApprovalModal />

        {/* CHT-003 fix: Custom risk confirmation dialog */}
        <RiskConfirmationDialog
          isOpen={riskConfirmState.isOpen}
          riskLevel={riskConfirmState.riskLevel}
          message={riskConfirmState.message}
          onConfirm={handleRiskConfirm}
          onCancel={handleRiskCancel}
        />
      </div>
    </ChatErrorBoundary>
  );
};

export default UnifiedAgenticChat;
