/* eslint-disable @typescript-eslint/no-explicit-any -- store selectors and event handlers use untyped state access */
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
import { listen as _listenBase, isTauri } from '@/lib/tauri-mock';
// Typed wrapper for listen to support generics in web build
const listen = <T = any,>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<() => void> => _listenBase(event, handler as any);
import { invoke as ipcInvoke } from '@/utils/ipc';
import React, { useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAgenticEvents } from '@/hooks/useAgenticEvents';
import { useSlashCommands } from '@/hooks/useSlashCommands';
import { sha256 } from '@/lib/hash';
import { deriveTaskMetadata } from '@/lib/taskMetadata';
import { getModelForRequest } from '@/lib/modelRouter';
import { getModelMetadata } from '@/constants/llm';
import {
  useBillingUsageStore as _useBillingUsageStoreBase,
  selectBudget,
} from '@/stores/unified/billingUsage';
const useBillingUsageStore = _useBillingUsageStoreBase as unknown as (selector?: any) => any;
(useBillingUsageStore as any).getState = () => ({});
import { useModelStore } from '@/stores/unified/modelStore';
import { useSettingsStore } from '@/stores/unified/settingsStore';
import {
  useUnifiedChatStore,
  type SidecarMode,
  uuidToDbId,
} from '@/stores/unified/unifiedChatStore';
import { useBillingStore } from '@/stores/unified/auth';
import { useCustomInstructionsStore } from '@/stores/unified/customInstructionsStore';
import { useExecutionStore } from '@/stores/unified/executionStore';
import { useProjectStore } from '@/stores/unified/projectStore';
import { supabaseAuth } from '@/services/supabaseAuth';
import type { Artifact, ResearchTask } from '@/types/chat';
import { formatErrorForChat } from '@/lib/friendlyErrors';
import { toast } from '@/hooks/useToast';
import { refreshCreditsAfterMessage } from '@/hooks/useCreditRefresh';
import { NEW_CHAT_ABORT_EVENT } from '@/lib/newChatReset';
import { getToolDisplayInfo } from '@/lib/toolDisplayNames';
import { CanvasWorkspace } from '../Canvas';
import { ChatErrorBoundary } from '../ErrorBoundary';
import { SectionErrorBoundary } from '../ui/SectionErrorBoundary';
import { AppLayout } from './AppLayout';
import { ApprovalModal } from './ApprovalModal';
import { BudgetAlertsPanel } from './BudgetAlertsPanel';
import { ChatInputArea, type SendOptions } from './ChatInputArea';
import { ChatStream } from './ChatStream';
import { ProjectsView } from './ProjectsView';
import { RiskConfirmationDialog, useRiskConfirmation } from './RiskConfirmationDialog';
import { BackgroundTaskIndicator } from '../BackgroundTasks';
import { resolveToolHardTimeoutMs, shouldAbortGenerationOnToolTimeout } from './toolTimeoutPolicy';
import {
  executeTerminalCommand,
  executeBrowserCommand,
  executeCodeCommand,
  executeDatabaseCommand,
  executeUndoCommand,
} from '@/handlers/slashCommandHandlers';

const TOOL_EXECUTION_SOFT_TIMEOUT_MS = 10_000;

const normalizeToolNameForUi = (toolName: string): string => {
  if (toolName.startsWith('__server__')) {
    const trimmed = toolName.slice('__server__'.length);
    return trimmed || toolName;
  }
  return toolName;
};

const toolNameToArtifactType = (toolName: string): Artifact['type'] => {
  const normalized = normalizeToolNameForUi(toolName).toLowerCase();
  if (normalized.includes('image') || normalized.includes('video')) return 'image';
  if (normalized.includes('document') || normalized.includes('pdf') || normalized.includes('word'))
    return 'document';
  if (normalized.includes('excel') || normalized.includes('sheet') || normalized.includes('table'))
    return 'spreadsheet';
  return 'code';
};

const toolNameToTitle = (toolName: string): string => {
  const normalizedToolName = normalizeToolNameForUi(toolName);
  const displayInfo = getToolDisplayInfo(normalizedToolName);
  if (displayInfo.displayName !== 'Working') {
    return displayInfo.displayName;
  }
  return normalizedToolName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const extractMcpTextBlocks = (data: Record<string, unknown>): string[] => {
  const content = data['content'];
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((block) => {
    if (!block || typeof block !== 'object') {
      return [];
    }
    const typedBlock = block as Record<string, unknown>;
    const blockType = String(typedBlock['type'] ?? '').toLowerCase();
    const text = typedBlock['text'];
    if (blockType !== 'text' || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }
    return [text];
  });
};

const normalizeMcpFilesystemInlineData = (
  normalizedTool: string,
  data: Record<string, unknown>,
): void => {
  if (!normalizedTool.startsWith('mcp__filesystem__')) {
    return;
  }

  const textBlocks = extractMcpTextBlocks(data);
  if (textBlocks.length === 0) {
    return;
  }

  if (normalizedTool.endsWith('read_text_file') && typeof data['content'] !== 'string') {
    data['content'] = textBlocks.join('\n');
    data['source'] = (data['source'] as string | undefined) ?? 'mcp_filesystem_read_text_file';
    return;
  }

  if (normalizedTool.endsWith('list_allowed_directories')) {
    const directories = new Set<string>();
    textBlocks.forEach((text) => {
      text.split('\n').forEach((rawLine) => {
        let line = rawLine.trim();
        if (!line) {
          return;
        }
        if (line.startsWith('- ')) {
          line = line.slice(2).trim();
        } else if (line.startsWith('* ')) {
          line = line.slice(2).trim();
        } else if (line.startsWith('[DIR]')) {
          line = line.slice('[DIR]'.length).trim();
        }
        if (
          line.startsWith('/') ||
          line.startsWith('~/') ||
          line.startsWith('./') ||
          line.startsWith('../') ||
          line.includes(':\\')
        ) {
          directories.add(line);
        }
      });
    });
    if (directories.size > 0) {
      const values = Array.from(directories).sort();
      data['directories'] = values;
      data['count'] = values.length;
      data['source'] =
        (data['source'] as string | undefined) ?? 'mcp_filesystem_list_allowed_directories';
    }
    return;
  }

  if (
    (normalizedTool.endsWith('list_directory') ||
      normalizedTool.endsWith('list_directory_with_sizes')) &&
    !Array.isArray(data['entries'])
  ) {
    const pathHint = typeof data['path'] === 'string' ? data['path'] : '';
    const parsedEntries: Array<Record<string, unknown>> = [];

    textBlocks.forEach((text) => {
      text.split('\n').forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
          return;
        }

        let type: 'file' | 'directory' | 'symlink' | null = null;
        let name = '';
        if (line.startsWith('[DIR]')) {
          type = 'directory';
          name = line.slice('[DIR]'.length).trim();
        } else if (line.startsWith('[FILE]')) {
          type = 'file';
          name = line.slice('[FILE]'.length).trim();
        } else if (line.startsWith('[SYMLINK]')) {
          type = 'symlink';
          name = line.slice('[SYMLINK]'.length).trim();
        }
        if (!type || !name) {
          return;
        }

        if (type === 'file') {
          const sizeMatch = name.match(/\s+\([^)]*\)$/);
          if (sizeMatch) {
            name = name.slice(0, -sizeMatch[0].length).trim();
          }
        }
        if (!name) {
          return;
        }

        const fullPath = pathHint ? `${pathHint.replace(/[\\/]$/, '')}/${name}` : name;
        parsedEntries.push({
          name,
          type,
          path: fullPath,
          size: 0,
        });
      });
    });

    if (parsedEntries.length > 0) {
      parsedEntries.sort((a, b) =>
        String(a['name']).toLowerCase().localeCompare(String(b['name']).toLowerCase()),
      );
      data['entries'] = parsedEntries;
      data['returned'] = parsedEntries.length;
      data['count'] = parsedEntries.length;
      data['offset'] = 0;
      data['limit'] = parsedEntries.length;
      data['has_more'] = false;
      data['next_offset'] = null;
      data['source'] = (data['source'] as string | undefined) ?? 'mcp_filesystem_list_directory';
    }
  }
};

const normalizeInlineToolData = (
  toolName: string,
  rawData: Record<string, unknown>,
): Record<string, unknown> => {
  const normalizedTool = normalizeToolNameForUi(toolName).toLowerCase();
  const data = { ...rawData };

  if (normalizedTool.includes('image')) {
    const images = Array.isArray(data['images']) ? data['images'] : [];
    const normalizedImages = images.map((image) => {
      if (image && typeof image === 'object') {
        const img = image as Record<string, unknown>;
        return {
          ...img,
          url:
            (img['url'] as string | undefined) ??
            (img['image_url'] as string | undefined) ??
            (img['src'] as string | undefined),
          base64:
            (img['base64'] as string | undefined) ??
            (img['b64_json'] as string | undefined) ??
            (img['image_base64'] as string | undefined),
        };
      }
      return image;
    });

    // Accept single-image payload variants and normalize into images[]
    if (normalizedImages.length === 0) {
      const singleUrl =
        (data['url'] as string | undefined) ??
        (data['image_url'] as string | undefined) ??
        (data['src'] as string | undefined);
      const singleBase64 =
        (data['base64'] as string | undefined) ??
        (data['b64_json'] as string | undefined) ??
        (data['image_base64'] as string | undefined);
      if (singleUrl || singleBase64) {
        normalizedImages.push({
          url: singleUrl,
          base64: singleBase64,
        });
      }
    }

    data['images'] = normalizedImages;
    data['prompt'] =
      (data['prompt'] as string | undefined) ??
      (data['revised_prompt'] as string | undefined) ??
      (data['input_prompt'] as string | undefined);
  }

  if (normalizedTool.includes('video')) {
    const durationMs = data['duration_ms'] as number | undefined;
    data['videoUrl'] =
      (data['videoUrl'] as string | undefined) ??
      (data['video_url'] as string | undefined) ??
      (data['url'] as string | undefined) ??
      (data['output_url'] as string | undefined) ??
      (data['src'] as string | undefined);
    data['duration'] =
      (data['duration'] as number | undefined) ??
      (data['duration_secs'] as number | undefined) ??
      (data['durationSeconds'] as number | undefined) ??
      (durationMs !== undefined ? durationMs / 1000 : undefined);
    data['prompt'] =
      (data['prompt'] as string | undefined) ??
      (data['revised_prompt'] as string | undefined) ??
      (data['input_prompt'] as string | undefined);
  }

  if (normalizedTool.includes('document')) {
    data['filePath'] =
      (data['filePath'] as string | undefined) ??
      (data['file_path'] as string | undefined) ??
      (data['output_path'] as string | undefined);
    data['downloadUrl'] =
      (data['downloadUrl'] as string | undefined) ?? (data['download_url'] as string | undefined);
  }

  if (normalizedTool === 'document_read') {
    const content = data['content'];
    if (content && typeof content === 'object') {
      const typedContent = content as Record<string, unknown>;
      const extractedText = typedContent['text'];
      if (typeof extractedText === 'string') {
        data['text'] = extractedText;
      }
      const metadata = typedContent['metadata'];
      if (metadata && typeof metadata === 'object') {
        data['metadata'] = metadata;
      }
    }
  }

  if (normalizedTool === 'document_extract_text') {
    const text = (data['text'] as string | undefined) ?? (data['content'] as string | undefined);
    if (typeof text === 'string') {
      data['text'] = text;
    }
  }

  if (normalizedTool.includes('screenshot') || normalizedTool.includes('capture_screen')) {
    const rawResult = data['raw_result'];
    const screenshotBase64 =
      (data['imageBase64'] as string | undefined) ??
      (data['image_base64'] as string | undefined) ??
      (data['base64'] as string | undefined) ??
      (typeof rawResult === 'string' && !rawResult.startsWith('{') && !rawResult.startsWith('[')
        ? rawResult
        : undefined);
    const screenshotUrl =
      (data['imageUrl'] as string | undefined) ??
      (data['image_url'] as string | undefined) ??
      (typeof rawResult === 'string' && rawResult.startsWith('http') ? rawResult : undefined);

    if (screenshotBase64) {
      data['imageBase64'] = screenshotBase64;
    }
    if (screenshotUrl) {
      data['imageUrl'] = screenshotUrl;
    }
  }

  if (normalizedTool.startsWith('browser_') || normalizedTool.startsWith('ui_')) {
    // Preserve key browser/UI outputs in a consistent shape for inline renderers.
    data['toolName'] = normalizeToolNameForUi(toolName);
    const title = data['title'];
    if (typeof title === 'string' && title.trim().length > 0) {
      data['content'] = data['content'] ?? title;
    }
    const html = data['html'];
    if (typeof html === 'string' && html.trim().length > 0 && !data['content']) {
      data['content'] = html;
    }
  }

  // AUDIT-UI-023: Normalize file_read tool data to match InlineCodeDiff expectations
  // file_read returns { path, content } but InlineCodeDiff expects { filePath, before, after, operation }
  if (
    normalizedTool === 'file_read' ||
    normalizedTool.endsWith('read_text_file') ||
    normalizedTool.includes('file_read')
  ) {
    const path = (data['path'] as string | undefined) ?? (data['filePath'] as string | undefined);
    const content = (data['content'] as string | undefined) ?? (data['text'] as string | undefined);

    if (path && content !== undefined) {
      // Transform into diff/read shape that InlineCodeDiff expects
      data['filePath'] = path;
      data['operation'] = 'read';
      data['before'] = '';
      data['after'] = content;
      data['success'] = data['success'] !== false;
    }
  }

  normalizeMcpFilesystemInlineData(normalizedTool, data);

  return data;
};

/**
 * BudgetTracker Component
 * Moves message-based budget calculations out of the main UnifiedAgenticChat
 * to prevent full-tree re-renders on every message update.
 */
const BudgetTracker: React.FC = () => {
  const budget = useBillingUsageStore(selectBudget);
  const messages = useUnifiedChatStore((state) => state.messages);
  const addTokenUsage = useBillingUsageStore((state: any) => state.addTokenUsage);
  const countedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!budget.enabled) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const messageId = String(lastMessage.id ?? crypto.randomUUID());
    if (countedMessageIdsRef.current.has(messageId)) {
      return;
    }
    // Only count tokens for completed assistant messages or user messages
    if (lastMessage.metadata?.streaming) return;

    const tokens =
      lastMessage.metadata?.tokenCount ?? Math.ceil((lastMessage.content?.length ?? 0) * 0.25);
    addTokenUsage(tokens);
    countedMessageIdsRef.current.add(messageId);
  }, [messages, budget.enabled, addTokenUsage]);

  return null;
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
      activeView: state.activeView,
      setWorkflowContext: state.setWorkflowContext,
    })),
  );

  // CHT-008 fix: Consolidated settings and model store selectors
  const llmConfig = useSettingsStore(useShallow((state: any) => state.llmConfig));
  const { selectedProvider, selectedModel } = useModelStore(
    useShallow((state: any) => ({
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
    })),
  ) as any;

  // CHT-008 fix: Consolidated billing store selectors
  const { loadCostOverview: loadOverview } = useBillingUsageStore(
    useShallow((state: any) => ({
      loadCostOverview: state.loadCostOverview,
    })),
  ) as any;

  // Budget tracking moved to sub-component BudgetTracker

  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to store unlisten functions for synchronous cleanup
  // Note: Unlisten can return void or Promise<void> depending on the event type
  const unlistenFnsRef = useRef<Array<() => void | Promise<void>>>([]);
  // Guards async listener registration against StrictMode/dev double-mount races.
  const listenerSetupGenerationRef = useRef(0);
  const isMountedRef = useRef(true);
  const toolExecutionTimeoutsRef = useRef<
    Map<
      string,
      {
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());

  // CHT-005 fix: Track active stream sessions to prevent race conditions
  const activeStreamSessionsRef = useRef<Map<number, string>>(new Map());

  // AUDIT-STREAM-059 fix: Track stream watchdog timeout
  const streamWatchdogTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStreamActivityAtRef = useRef<number>(0);

  // Stream Throttling state - batches updates to avoid React saturation
  const streamBufferRef = useRef<Map<string, string>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  /**
   * Processes buffered stream updates using requestAnimationFrame.
   * This batches multiple chunks into a single React update per frame.
   */
  const processStreamBuffer = useCallback(() => {
    if (streamBufferRef.current.size === 0) {
      rafIdRef.current = null;
      return;
    }

    const state = useUnifiedChatStore.getState();
    streamBufferRef.current.forEach((content, messageId) => {
      state.updateMessage(messageId, {
        content,
        metadata: { streaming: true },
      });
    });

    streamBufferRef.current.clear();
    rafIdRef.current = requestAnimationFrame(processStreamBuffer);
  }, []);

  const queueStreamUpdate = useCallback(
    (messageId: string, fullContent: string) => {
      streamBufferRef.current.set(messageId, fullContent);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(processStreamBuffer);
      }
    },
    [processStreamBuffer],
  ); // Added queueStreamUpdate via useCallback dependency

  const clearQueuedStreamUpdates = useCallback((messageId?: string) => {
    if (messageId) {
      streamBufferRef.current.delete(messageId);
    } else {
      streamBufferRef.current.clear();
    }

    if (streamBufferRef.current.size === 0 && rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const markStreamActivity = useCallback(() => {
    lastStreamActivityAtRef.current = Date.now();
  }, []);

  // AUDIT-STREAM-059 fix: Track stream watchdog timeout

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

    const setupGeneration = ++listenerSetupGenerationRef.current;
    isMountedRef.current = true;
    // Clear any stale unlisten functions from previous render
    unlistenFnsRef.current = [];

    const setupListeners = async () => {
      // Helper to register unlisten functions as promises resolve
      const registerListener = async (listenerPromise: Promise<() => void>) => {
        try {
          const unlisten = await listenerPromise;
          const isActiveSetup =
            isMountedRef.current && listenerSetupGenerationRef.current === setupGeneration;
          if (isActiveSetup) {
            unlistenFnsRef.current.push(unlisten);
          } else {
            // Component unmounted while setting up, clean up immediately
            unlisten();
          }
        } catch (error) {
          console.error('[UnifiedAgenticChat] Failed to setup listener:', error);
        }
      };

      const getConversationMessagesForStream = (conversationId: number) => {
        const state = useUnifiedChatStore.getState();

        if (
          state.activeConversationId &&
          uuidToDbId(state.activeConversationId) === conversationId
        ) {
          return state.messages;
        }

        const matchingConversationId = Object.keys(state.messagesByConversation).find(
          (id) => uuidToDbId(id) === conversationId,
        );

        if (matchingConversationId) {
          return state.messagesByConversation[matchingConversationId] ?? [];
        }

        return [];
      };

      const findMessageById = (messageId: string) => {
        const state = useUnifiedChatStore.getState();
        const direct = state.messages.find((msg) => msg.id === messageId);
        if (direct) return direct;

        for (const messages of Object.values(state.messagesByConversation)) {
          const found = messages.find((msg) => msg.id === messageId);
          if (found) return found;
        }
        return null;
      };

      const resolveStreamTargetMessageId = (
        conversationId: number,
        payloadMessageId?: string | number,
      ): string | null => {
        const state = useUnifiedChatStore.getState();
        const conversationMessages = getConversationMessagesForStream(conversationId);
        const sessionMessageId = activeStreamSessionsRef.current.get(conversationId);
        const normalizedPayloadId =
          payloadMessageId === undefined || payloadMessageId === null
            ? null
            : String(payloadMessageId);

        // Priority 1: Session-tracked message for this conversation
        if (sessionMessageId && conversationMessages.some((m) => m.id === sessionMessageId)) {
          return sessionMessageId;
        }
        // Priority 2: Explicit message ID from payload
        if (
          normalizedPayloadId &&
          conversationMessages.some((m) => String(m.id) === normalizedPayloadId)
        ) {
          return normalizedPayloadId;
        }
        // Priority 3: Current streaming message (only if it belongs to this conversation)
        if (
          state.currentStreamingMessageId &&
          conversationMessages.some((m) => String(m.id) === String(state.currentStreamingMessageId))
        ) {
          return state.currentStreamingMessageId;
        }

        // FALLBACK: Find ANY assistant message in this conversation (even if not streaming)
        if (conversationMessages.length > 0) {
          const streamingAssistant = conversationMessages.find(
            (m) => m.role === 'assistant' && m.metadata?.streaming,
          );
          if (streamingAssistant) {
            return streamingAssistant.id;
          }
          const lastAssistant = [...conversationMessages]
            .reverse()
            .find((m) => m.role === 'assistant');
          if (lastAssistant) {
            return lastAssistant.id;
          }
        }

        // Last resort: use currentStreamingMessageId even if not in this conversation's messages
        if (state.currentStreamingMessageId) {
          return state.currentStreamingMessageId;
        }

        return null;
      };

      const upsertToolArtifact = (
        conversationId: number,
        toolCallId: string,
        patch: Record<string, unknown>,
        payloadMessageId?: string | number,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessageId = resolveStreamTargetMessageId(conversationId, payloadMessageId);
        if (!targetMessageId) {
          console.warn('[upsertToolArtifact] No target message found for toolCallId:', toolCallId);
          return;
        }

        const targetMessage = findMessageById(targetMessageId);
        if (!targetMessage) {
          console.warn('[upsertToolArtifact] Message not found for id:', targetMessageId);
          return;
        }

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

      const finalizeRunningArtifactsForMessage = (
        messageId: string,
        status: 'completed' | 'failed' | 'cancelled',
        reason: string,
      ) => {
        const state = useUnifiedChatStore.getState();
        const targetMessage = findMessageById(messageId);
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
        if (baseArtifacts.length === 0) return;

        let changed = false;
        const nextArtifacts = baseArtifacts.map((artifact) => {
          const withRuntimeFields = artifact as Artifact & {
            status?: string;
            success?: boolean;
            error?: string;
            content?: string;
          };
          if (withRuntimeFields.status !== 'running') {
            return artifact;
          }
          changed = true;
          const currentContent = (withRuntimeFields.content || '').trim();
          if (status === 'completed') {
            return {
              ...withRuntimeFields,
              status: 'completed',
              success: true,
              content: currentContent || 'Tool completed. Output included in assistant response.',
            } as Artifact;
          }
          if (status === 'cancelled') {
            return {
              ...withRuntimeFields,
              status: 'cancelled',
              success: false,
              error: reason,
              content: currentContent || reason,
            } as Artifact;
          }
          return {
            ...withRuntimeFields,
            status: 'failed',
            success: false,
            error: reason,
            content: currentContent || reason,
          } as Artifact;
        });

        if (!changed) return;
        state.updateMessage(messageId, {
          artifacts: nextArtifacts as Artifact[],
          metadata: {
            artifacts: nextArtifacts as Artifact[],
          },
        });
      };

      const clearAgentIterationEntries = () => {
        const state = useUnifiedChatStore.getState();
        const entriesToRemove = state.actionTrail.filter((entry) => {
          if (entry.type !== 'running') return false;
          const metadata = entry.metadata as Record<string, unknown> | undefined;
          if (metadata?.['agent_progress'] === true) return true;
          return entry.message.startsWith('Agent iteration ');
        });
        for (const entry of entriesToRemove) {
          state.removeActionTrailEntry(entry.id);
        }
      };

      const clearToolExecutionTimeout = (toolCallId: string) => {
        const timeoutEntry = toolExecutionTimeoutsRef.current.get(toolCallId);
        if (timeoutEntry) {
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
          toolExecutionTimeoutsRef.current.delete(toolCallId);
        }
      };

      const scheduleToolExecutionTimeout = (
        toolCallId: string,
        toolName: string,
        conversationId: number,
        resetExisting: boolean,
        payloadMessageId?: string | number,
      ) => {
        if (resetExisting) {
          clearToolExecutionTimeout(toolCallId);
        } else if (toolExecutionTimeoutsRef.current.has(toolCallId)) {
          return;
        }

        const toolHardTimeoutMs = resolveToolHardTimeoutMs(toolName);
        const softTimeoutId = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (!toolExecutionTimeoutsRef.current.has(toolCallId)) return;

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `${toolName} is still running... retrying status check`,
            metadata: {
              tool_call_id: toolCallId,
              timeout_ms: TOOL_EXECUTION_SOFT_TIMEOUT_MS,
            },
            fadeAfter: 3500,
          });
        }, TOOL_EXECUTION_SOFT_TIMEOUT_MS);

        const hardTimeoutId = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (!toolExecutionTimeoutsRef.current.has(toolCallId)) return;

          console.warn(
            `[UnifiedAgenticChat] Tool execution timed out: ${toolName} (${toolCallId})`,
          );
          const timeoutMessage =
            'Tool is taking longer than expected. Waiting for a final result from the agent.';
          const abortOnTimeout = shouldAbortGenerationOnToolTimeout(toolName);

          if (abortOnTimeout) {
            upsertToolArtifact(
              conversationId,
              toolCallId,
              {
                toolName,
                type: toolNameToArtifactType(toolName),
                title: toolNameToTitle(toolName),
                status: 'failed',
                success: false,
                error:
                  'Tool timed out waiting for completion. Please retry the request or narrow the operation scope.',
                content:
                  'Tool timed out waiting for completion. Please retry the request or narrow the operation scope.',
              },
              payloadMessageId,
            );
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'error',
              message: `${toolName} timed out after ${Math.round(toolHardTimeoutMs / 1000)}s`,
              metadata: {
                tool_call_id: toolCallId,
                timeout_ms: toolHardTimeoutMs,
              },
              fadeAfter: 4500,
            });

            const state = useUnifiedChatStore.getState();
            state.setIsLoading(false);
            state.setStreamingMessage(null);
            if (state.currentStreamingMessageId) {
              state.updateMessage(state.currentStreamingMessageId, {
                metadata: { streaming: false },
              });
            }
            if (isTauri) {
              void ipcInvoke('chat_stop_generation').catch((error: unknown) => {
                console.warn(
                  '[UnifiedAgenticChat] Failed to stop generation after tool timeout:',
                  error,
                );
              });
            }
          } else {
            upsertToolArtifact(
              conversationId,
              toolCallId,
              {
                toolName,
                type: toolNameToArtifactType(toolName),
                title: toolNameToTitle(toolName),
                status: 'running',
                success: undefined,
                content: timeoutMessage,
                timeoutWarning: true,
              },
              payloadMessageId,
            );
            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `${toolName} is taking longer than expected. Waiting for completion...`,
              metadata: {
                tool_call_id: toolCallId,
                timeout_ms: toolHardTimeoutMs,
                timeout_warning: true,
              },
              fadeAfter: 5000,
            });
          }
          clearToolExecutionTimeout(toolCallId);
        }, toolHardTimeoutMs);

        toolExecutionTimeoutsRef.current.set(toolCallId, {
          softTimeoutId,
          hardTimeoutId,
        });
      };

      /**
       * Shared stream teardown helper extracted from stream-end and stream-error handlers.
       * Clears queued updates, abort controller, loading state, tool timeouts, and agent status.
       */
      const finalizeStream = (
        finalizedMessageId: string | null,
        agentOutcome: 'completed' | 'failed',
        agentError?: string,
      ) => {
        if (finalizedMessageId) {
          clearQueuedStreamUpdates(finalizedMessageId);
        } else {
          clearQueuedStreamUpdates();
        }
        abortControllerRef.current = null;

        const s = useUnifiedChatStore.getState();
        s.setIsLoading(false);
        s.setStreamingMessage(null);
        toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
          clearTimeout(timeoutEntry.softTimeoutId);
          clearTimeout(timeoutEntry.hardTimeoutId);
        });
        toolExecutionTimeoutsRef.current.clear();

        const currentAgent = useUnifiedChatStore.getState().agentStatus;
        if (currentAgent?.status === 'running') {
          useUnifiedChatStore.getState().setAgentStatus({
            ...currentAgent,
            status: agentOutcome,
            completedAt: new Date(),
            ...(agentOutcome === 'failed' && agentError ? { error: agentError } : {}),
          });
        }
        clearAgentIterationEntries();
      };

      registerListener(
        listen<{ conversation_id: number; message_id: string | number; created_at: string }>(
          'chat:stream-start',
          ({ payload }) => {
            if (!isMountedRef.current) return;
            markStreamActivity();

            // Create new AbortController for this streaming session
            // This allows handleStopGeneration to cancel the current stream
            abortControllerRef.current = new AbortController();

            // CHT-005 fix: Register this stream session with conversation-to-message mapping
            // This prevents race conditions when multiple streams are active
            const messageId = String(payload.message_id);
            activeStreamSessionsRef.current.set(payload.conversation_id, messageId);

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
          markStreamActivity();
          const authoritativeId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          if (authoritativeId) {
            queueStreamUpdate(authoritativeId, payload.content);
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
          markStreamActivity();
          const state = useUnifiedChatStore.getState();
          const messageId = String(payload.message_id);
          const currentStreamingId = state.currentStreamingMessageId;

          // CHT-005 fix: Use session tracking for reliable message identification
          const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
          const targetId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          const currentMatchesSession =
            !!currentStreamingId &&
            (currentStreamingId === sessionMessageId || currentStreamingId === messageId);
          let finalizedMessageId: string | null = null;
          let hasValidTarget = targetId !== null || currentMatchesSession;

          // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
          // This prevents stale stream-end events from one conversation clearing
          // active loading state for a different in-flight chat
          if (targetId) {
            finalizedMessageId = targetId;
            state.updateMessage(targetId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
            finalizeRunningArtifactsForMessage(
              targetId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          } else if (currentStreamingId && currentMatchesSession) {
            finalizedMessageId = currentStreamingId;
            state.updateMessage(currentStreamingId, {
              metadata: {
                streaming: false,
                tokenCount: payload.usage?.total_tokens,
                cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
              },
            });
            finalizeRunningArtifactsForMessage(
              currentStreamingId,
              'completed',
              'Tool completed without explicit terminal event.',
            );
          } else {
            // Fallback: clear any assistant message still marked as streaming to
            // avoid stale "Generating" UI when stream-end IDs don't resolve cleanly.
            const fallbackStreaming = [...state.messages]
              .reverse()
              .find((m) => m.role === 'assistant' && m.metadata?.streaming);
            if (fallbackStreaming) {
              finalizedMessageId = fallbackStreaming.id;
              hasValidTarget = true;
              state.updateMessage(fallbackStreaming.id, {
                metadata: {
                  streaming: false,
                  tokenCount: payload.usage?.total_tokens,
                  cost: payload.credits?.cost_cents ? payload.credits.cost_cents / 100 : undefined,
                },
              });
              finalizeRunningArtifactsForMessage(
                fallbackStreaming.id,
                'completed',
                'Tool completed without explicit terminal event.',
              );
            }
          }

          // CHT-005 fix: Clean up stream session tracking
          activeStreamSessionsRef.current.delete(payload.conversation_id);

          // AUDIT-STREAM-059 fix: Clear the stream watchdog since we got a valid stream-end
          if (streamWatchdogTimeoutRef.current) {
            clearTimeout(streamWatchdogTimeoutRef.current);
            streamWatchdogTimeoutRef.current = null;
          }

          // Update billing store with new credit info
          if (payload.credits) {
            useBillingStore.getState().updateCredits(payload.credits);
          }

          const hasOtherActiveStreams = activeStreamSessionsRef.current.size > 0;
          const shouldClearGlobalState = hasValidTarget || !hasOtherActiveStreams;

          if (!hasValidTarget) {
            console.warn(
              '[UnifiedAgenticChat] stream-end received without valid target; applying fallback cleanup policy',
              {
                payloadMessageId: messageId,
                sessionMessageId,
                currentStreamingId,
                finalizedMessageId,
                hasOtherActiveStreams,
              },
            );
          }

          if (shouldClearGlobalState) {
            finalizeStream(finalizedMessageId, 'completed');
          }
        }),
      );

      // Listen for stream errors
      registerListener(
        listen<{ conversation_id: number; message_id: string | number; error: string }>(
          'chat:stream-error',
          ({ payload }) => {
            markStreamActivity();
            const state = useUnifiedChatStore.getState();
            const messageId = String(payload.message_id);
            const currentStreamingId = state.currentStreamingMessageId;

            // CHT-005 fix: Use session tracking for reliable message identification
            const sessionMessageId = activeStreamSessionsRef.current.get(payload.conversation_id);
            const targetId = resolveStreamTargetMessageId(
              payload.conversation_id,
              payload.message_id,
            );
            const currentMatchesSession =
              !!currentStreamingId &&
              (currentStreamingId === sessionMessageId || currentStreamingId === messageId);

            // AUDIT-STREAM-033 fix: Only clear global state if we have a valid target
            let hasValidTarget = targetId !== null || currentMatchesSession;
            let finalizedMessageId: string | null = null;

            if (targetId) {
              finalizedMessageId = targetId;
              // Always use friendly error messages — no raw error strings in the UI
              const displayError = formatErrorForChat(payload.error, true);

              state.updateMessage(targetId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
              finalizeRunningArtifactsForMessage(
                targetId,
                'failed',
                payload.error || 'Tool failed while generating the response.',
              );
            } else if (currentStreamingId && currentMatchesSession) {
              finalizedMessageId = currentStreamingId;
              const displayError = formatErrorForChat(payload.error, true);

              state.updateMessage(currentStreamingId, {
                content: displayError,
                metadata: { streaming: false },
                error: payload.error,
              });
              finalizeRunningArtifactsForMessage(
                currentStreamingId,
                'failed',
                payload.error || 'Tool failed while generating the response.',
              );
            } else {
              // Fallback: clear any assistant message still marked as streaming to
              // avoid stale "Generating" UI when stream-error IDs don't resolve cleanly.
              const fallbackStreaming = [...state.messages]
                .reverse()
                .find((m) => m.role === 'assistant' && m.metadata?.streaming);
              if (fallbackStreaming) {
                finalizedMessageId = fallbackStreaming.id;
                hasValidTarget = true;
                const displayError = formatErrorForChat(payload.error, true);
                state.updateMessage(fallbackStreaming.id, {
                  content: displayError,
                  metadata: { streaming: false },
                  error: payload.error,
                });
                finalizeRunningArtifactsForMessage(
                  fallbackStreaming.id,
                  'failed',
                  payload.error || 'Tool failed while generating the response.',
                );
              }
            }

            // CHT-005 fix: Clean up stream session tracking on error
            activeStreamSessionsRef.current.delete(payload.conversation_id);

            // AUDIT-STREAM-059 fix: Clear the stream watchdog since we got a valid stream-error
            if (streamWatchdogTimeoutRef.current) {
              clearTimeout(streamWatchdogTimeoutRef.current);
              streamWatchdogTimeoutRef.current = null;
            }

            const hasOtherActiveStreams = activeStreamSessionsRef.current.size > 0;
            const shouldClearGlobalState = hasValidTarget || !hasOtherActiveStreams;

            if (!hasValidTarget) {
              console.warn(
                '[UnifiedAgenticChat] stream-error received without valid target; applying fallback cleanup policy',
                {
                  payloadMessageId: messageId,
                  sessionMessageId,
                  currentStreamingId,
                  finalizedMessageId,
                  hasOtherActiveStreams,
                },
              );
            }

            if (shouldClearGlobalState) {
              finalizeStream(finalizedMessageId, 'failed', payload.error);
            }
          },
        ),
      );

      // Pending message event listeners
      registerListener(
        listen<{ id: string; content: string; timestamp: string; conversation_id?: number }>(
          'chat:pending-message-added',
          ({ payload }) => {
            useUnifiedChatStore.getState().addPendingMessage(payload);
          },
        ),
      );

      registerListener(
        listen<{ message: { id: string; content: string }; remaining: number }>(
          'chat:pending-message-consumed',
          ({ payload }) => {
            useUnifiedChatStore.getState().removePendingMessage(payload.message.id);
          },
        ),
      );

      registerListener(
        listen<{ count: number }>('chat:pending-messages-cleared', () => {
          useUnifiedChatStore.getState().clearPendingMessages();
        }),
      );

      registerListener(
        listen<{
          pending_messages: Array<{ id: string; content: string }>;
          current_tool?: string;
          current_phase?: string;
          count: number;
        }>('chat:pending-context-available', () => {
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
          // Auto-process pending messages by sending them as follow-up
          // This creates a seamless experience where queued messages are automatically sent
          // Process messages sequentially with delays to avoid race conditions
          for (let i = 0; i < payload.pending_messages.length; i++) {
            // Check if component is still mounted before processing each message
            if (!isMountedRef.current) {
              break;
            }

            const pending = payload.pending_messages[i];
            if (!pending) continue;

            // Remove from pending queue in store
            useUnifiedChatStore.getState().removePendingMessage(pending.id);

            // Clear from backend queue - pass conversation_id to ensure we pop the right message
            try {
              await ipcInvoke('chat_pop_pending_message', {
                request: { conversation_id: payload.conversation_id },
              });
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
        }),
      );

      // Listen for agent thinking state
      registerListener(
        listen<{ agent_id?: string; thinking: boolean; phase?: string; message?: string }>(
          'agent:thinking',
          ({ payload }) => {
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
          // Update action trail with completion status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? payload.result || 'Task completed successfully'
              : payload.error || 'Task failed',
            fadeAfter: 5000,
            metadata: { duration_ms: payload.duration_ms },
          });

          // Clear any running agent status
          // Note: agent:finished event may not fire in all cases, so we also clear on tool result
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && currentAgent.status === 'running') {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              status: payload.success ? 'completed' : 'failed',
              completedAt: new Date(),
              error: payload.error,
            });
          }
          clearAgentIterationEntries();
        }),
      );

      // AUDIT-APPROVAL-047 fix: Removed duplicate tool:confirmation_required handler.
      // The tool confirmation flow is now handled exclusively by useAgenticEvents which
      // adds approvals to pendingApprovals store. The ApprovalModal then handles
      // user responses via useApprovalActions, which correctly routes to either
      // respond_tool_confirmation (for MCP/tool confirmations) or agent_resolve_approval
      // (for agent-level approvals).

      // Tool execution event listeners - display tool calls in the UI
      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_calls: Array<{
            index: number;
            id: string;
            name: string;
            arguments: string;
          }>;
          streaming: boolean;
        }>('chat:tool-calls', ({ payload }) => {
          markStreamActivity();

          // CHT-009 fix: Update message metadata so MessageBubble renders the ToolCallCard
          // Find the target message
          const state = useUnifiedChatStore.getState();
          // Resolve deterministically: stream session map first, then explicit payload.message_id.

          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );

          // If we found a target message, update its metadata
          if (targetMessageId) {
            const firstTool = payload.tool_calls[0];
            if (firstTool) {
              const normalizedFirstToolName = normalizeToolNameForUi(firstTool.name);
              state.updateMessage(targetMessageId, {
                metadata: {
                  // key fields for MessageBubble to detect tool call
                  tool: normalizedFirstToolName,
                  tool_call: firstTool.id,
                  actionId: firstTool.id, // AUDIT-UI-035: Add actionId for MessageBubble store linkage
                  name: normalizedFirstToolName,
                  status: 'running',
                  // also keep streaming true so it shows as active
                  streaming: true,
                },
              });
            }
          }

          // Add to action trail to show which tools are being called
          for (const tc of payload.tool_calls) {
            const normalizedToolName = normalizeToolNameForUi(tc.name);
            let parsedArguments: Record<string, unknown> = {};
            try {
              parsedArguments = tc.arguments
                ? (JSON.parse(tc.arguments) as Record<string, unknown>)
                : {};
            } catch {
              // Keep fallback empty object if arguments are partial/non-JSON.
            }

            upsertToolArtifact(
              payload.conversation_id,
              tc.id,
              {
                toolName: normalizedToolName, // Use normalized tool names for renderer lookups
                type: toolNameToArtifactType(normalizedToolName),
                title: toolNameToTitle(normalizedToolName),
                status: 'running',
                content: '',
                ...(parsedArguments['prompt'] ? { prompt: parsedArguments['prompt'] } : {}),
                ...(parsedArguments['output_path']
                  ? { filePath: parsedArguments['output_path'] }
                  : {}),
                ...(parsedArguments['file_path'] ? { filePath: parsedArguments['file_path'] } : {}),
              },
              payload.message_id,
            );

            useUnifiedChatStore.getState().addActionTrailEntry({
              type: 'running',
              message: `Calling ${normalizedToolName}...`,
              metadata: { tool_call_id: tc.id, arguments: tc.arguments },
            });

            // Guard against dropped/missed `chat:tool-executing` events.
            // We start a timeout here as a fallback so every running tool resolves.
            scheduleToolExecutionTimeout(
              tc.id,
              normalizedToolName,
              payload.conversation_id,
              false,
              payload.message_id,
            );
          }
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_call_id: string;
          tool_name: string;
          arguments: string;
        }>('chat:tool-executing', ({ payload }) => {
          markStreamActivity();
          const normalizedToolName = normalizeToolNameForUi(payload.tool_name);
          scheduleToolExecutionTimeout(
            payload.tool_call_id,
            normalizedToolName,
            payload.conversation_id,
            true,
            payload.message_id,
          );

          // Update action trail with executing status
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Executing ${normalizedToolName}...`,
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
          markStreamActivity();
          clearAgentIterationEntries();
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.status === 'limit_reached' ? 'error' : 'running',
            message:
              payload.status === 'limit_reached'
                ? `Agent reached iteration limit (${payload.max_iterations})`
                : `Agent iteration ${payload.iteration}/${payload.max_iterations}${payload.tool_count ? ` — ${payload.tool_count} tool(s)` : ''}`,
            metadata: {
              agent_progress: true,
              iteration: payload.iteration,
              max_iterations: payload.max_iterations,
            },
            fadeAfter: payload.status === 'limit_reached' ? 5000 : 60000,
          });
        }),
      );

      registerListener(
        listen<{
          conversation_id: number;
          message_id?: string | number;
          tool_call_id: string;
          tool_name: string;
          success: boolean;
          result: string;
          result_data?: Record<string, unknown>;
        }>('chat:tool-result', ({ payload }) => {
          markStreamActivity();
          const normalizedToolName = normalizeToolNameForUi(payload.tool_name);
          clearToolExecutionTimeout(payload.tool_call_id);

          let parsedData: Record<string, unknown> = payload.result_data || {};
          if (!payload.result_data && payload.result) {
            try {
              const parsed = JSON.parse(payload.result);
              if (parsed && typeof parsed === 'object') {
                parsedData = parsed as Record<string, unknown>;
              }
            } catch {
              // Keep raw string available so inline renderers can still display content.
              parsedData = { raw_result: payload.result };
            }
          }

          const normalizedData = normalizeInlineToolData(normalizedToolName, parsedData);

          upsertToolArtifact(
            payload.conversation_id,
            payload.tool_call_id,
            {
              toolName: normalizedToolName,
              type: toolNameToArtifactType(normalizedToolName),
              title: toolNameToTitle(normalizedToolName),
              status: payload.success ? 'completed' : 'failed',
              success: payload.success,
              error: payload.success ? undefined : payload.result,
              content: payload.result || '',
              ...normalizedData,
            },
            payload.message_id,
          );

          // AUDIT-UI-034: Update message metadata status when tool result arrives
          // This ensures the tool card transitions from "running" to "completed/failed"
          const targetMessageId = resolveStreamTargetMessageId(
            payload.conversation_id,
            payload.message_id,
          );
          if (targetMessageId) {
            useUnifiedChatStore.getState().updateMessage(targetMessageId, {
              metadata: {
                status: payload.success ? 'completed' : 'failed',
                streaming: false, // Stop streaming indicator
              },
            });
          }

          // Update action trail with result
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? `${normalizedToolName} completed`
              : `${normalizedToolName} failed`,
            metadata: { tool_call_id: payload.tool_call_id, result_preview: payload.result },
            fadeAfter: 3000,
          });

          // Remove the old "running" entry for this tool_call_id to prevent "Running..." from staying
          const state = useUnifiedChatStore.getState();
          const actionTrail = state.actionTrail;
          const runningEntries = actionTrail.filter((entry) => {
            if (entry.type !== 'running') return false;
            const metadataToolCallId = (entry.metadata as Record<string, unknown> | undefined)?.[
              'tool_call_id'
            ];
            if (metadataToolCallId === payload.tool_call_id) return true;
            // Backward compatibility: clear legacy running entries that were added without metadata.
            return (
              entry.message === `Executing ${normalizedToolName}...` ||
              entry.message === `Calling ${normalizedToolName}...`
            );
          });
          for (const runningEntry of runningEntries) {
            state.removeActionTrailEntry(runningEntry.id);
          }

          // Keep agent status coherent during multi-step runs:
          // a single tool result should update step text, not mark the whole run complete.
          const currentAgent = useUnifiedChatStore.getState().agentStatus;
          if (currentAgent && currentAgent.status === 'running') {
            useUnifiedChatStore.getState().setAgentStatus({
              ...currentAgent,
              currentStep: payload.success
                ? `Completed ${normalizedToolName}`
                : `Failed ${normalizedToolName}`,
            });
          }
        }),
      );

      // AUDIT-STREAM-022 fix: Listen for agi:tool_stream cancelled events
      // This ensures cancellation is properly handled for both event channels:
      // - agi:tool_stream (handled by useAgenticEvents.ts via activeToolStreams)
      // - chat:tool-* (handled here for UI updates)
      registerListener(
        listen<{
          event: {
            type: string;
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };
          timestamp: string;
        }>('agi:tool_stream', (event) => {
          if (!isMountedRef.current) return;
          const { event: streamEvent, timestamp } = event.payload;

          // Mark activity on every AGI tool stream event so the watchdog
          // doesn't fire during long-running tools (e.g. image generation 30-90s)
          markStreamActivity();

          // Only handle cancelled events for cancellation cleanup
          if (streamEvent.type !== 'cancelled') return;

          const cancelledEvent = streamEvent as {
            type: 'cancelled';
            tool_id: string;
            reason?: string;
            duration_ms: number;
          };

          // Clear any tool execution timeout that might be pending
          clearToolExecutionTimeout(cancelledEvent.tool_id);

          // Update action trail to reflect cancellation
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'error',
            message: `Tool cancelled: ${cancelledEvent.reason || 'Cancelled by user'}`,
            metadata: { tool_call_id: cancelledEvent.tool_id },
            fadeAfter: 3000,
          });

          // Update message metadata to reflect cancelled status
          // We need to find the message that contains this tool's artifact
          const state = useUnifiedChatStore.getState();
          for (const message of state.messages) {
            const artifacts = message.artifacts || [];
            const artifactIndex = artifacts.findIndex((a) => a.id === cancelledEvent.tool_id);
            if (artifactIndex >= 0) {
              const existingArtifact = artifacts[artifactIndex];
              if (existingArtifact) {
                const updatedArtifact = {
                  ...existingArtifact,
                  metadata: {
                    ...existingArtifact.metadata,
                    status: 'cancelled',
                    error: cancelledEvent.reason,
                    completedAt: new Date(timestamp).toISOString(),
                    duration_ms: cancelledEvent.duration_ms,
                  },
                };
                const updatedArtifacts = [...artifacts];
                updatedArtifacts[artifactIndex] = updatedArtifact;

                state.updateMessage(message.id, {
                  artifacts: updatedArtifacts,
                  metadata: {
                    ...message.metadata,
                    artifacts: updatedArtifacts,
                    status: 'cancelled',
                    streaming: false,
                  },
                });
              }
              break;
            }
          }
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
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            // Update the step status
            const updatedSteps = task.steps.map((step: any, index: any) => {
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
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step: any, index: any) => {
              if (index === payload.step_index || step.id === payload.step_id) {
                return {
                  ...step,
                  status: payload.success ? ('completed' as const) : ('failed' as const),
                  details: payload.details,
                };
              }
              return step;
            });
            const completedCount = updatedSteps.filter((s: any) => s.status === 'completed').length;
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
          const executionStore = useExecutionStore.getState();
          const task = executionStore.researchTasks[payload.task_id];
          if (task) {
            const updatedSteps = task.steps.map((step: any) => ({
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

      // Clean up RAF
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Abort any active streaming to prevent background work after unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Clear stale stream session tracking
      activeStreamSessions.clear();
      // Copy ref value to variable for cleanup to avoid stale closure issues
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeouts = new Map(toolExecutionTimeoutsRef.current);
      timeouts.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      timeouts.clear();

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
  }, [clearQueuedStreamUpdates, markStreamActivity, queueStreamUpdate]);

  useEffect(() => {
    if (defaultSidecarOpen === false) {
      setSidecarOpen(false);
    }
  }, [defaultSidecarOpen, setSidecarOpen]);

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
    void loadOverview().catch((err: unknown) =>
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
        await ipcInvoke('agent_set_workflow_hash', { workflow_hash: workflowHash });
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
        const response = await ipcInvoke<ChatSendMessageResponse>('chat_send_message', {
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
          useBillingStore.getState().updateCredits(response.credits);
        }

        // Trigger a credit refresh after message is sent to update UI with fresh balance
        // This helps users see their remaining credits in near real-time
        void refreshCreditsAfterMessage();
      }
    } catch (error) {
      console.error('[UnifiedAgenticChat] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Always use friendly messages — formatErrorForChat handles all modes consistently
      const userMessage = formatErrorForChat(errorMessage, true);
      updateMessage(assistantMessageId, {
        content: userMessage,
        metadata: { streaming: false },
        error: errorMessage,
      });
      // Clean up loading state on error - for successful streaming, chat:stream-end handles this
      clearQueuedStreamUpdates(assistantMessageId);
      setIsLoading(false);
      setStreamingMessage(null);
    } finally {
      // AUDIT-STREAM-059 fix: Add finally block with watchdog timeout to prevent stuck loading states
      // The watchdog now tracks inactivity (not absolute wall time), so long
      // generations stay alive while chunks/tool events are still flowing.
      // Bug 3 note: stream_watchdog_timeout in agent mode was a downstream symptom of
      // Bug 2 (missing VITE_SUPABASE_URL in production → Supabase module threw at load
      // → auth never initialized → LLM streaming never started → watchdog fired).
      // Fix 2 (supabase.ts graceful degradation + .env.production) resolves Bug 3.
      // If stream_watchdog_timeout recurs without Bug 2 present, check the Rust-side
      // 30-second stream connection timeout in llm_router.rs (stream_timeout variable).
      const WATCHDOG_TIMEOUT_MS = 60 * 1000; // 60 seconds of inactivity (accommodates image generation 30-90s)
      markStreamActivity();

      const scheduleWatchdog = () => {
        if (streamWatchdogTimeoutRef.current) {
          clearTimeout(streamWatchdogTimeoutRef.current);
        }
        streamWatchdogTimeoutRef.current = setTimeout(() => {
          const state = useUnifiedChatStore.getState();
          const idleMs = Date.now() - lastStreamActivityAtRef.current;

          // If there was recent activity, extend watchdog instead of forcing cleanup.
          if (idleMs < WATCHDOG_TIMEOUT_MS) {
            scheduleWatchdog();
            return;
          }

          // If there are active tool executions (e.g. image/video generation that takes 30-90s),
          // keep extending the watchdog rather than killing the stream prematurely.
          // Covers both: chat-path tools (toolExecutionTimeoutsRef) and AGI-path tools (activeToolStreams).
          if (toolExecutionTimeoutsRef.current.size > 0 || state.activeToolStreams.size > 0) {
            scheduleWatchdog();
            return;
          }

          if (state.isLoading || state.currentStreamingMessageId) {
            console.warn(
              '[UnifiedAgenticChat] AUDIT-STREAM-059: Inactivity watchdog triggered - cleaning up stale streaming state',
              { idleMs, messageId: assistantMessageId },
            );

            clearQueuedStreamUpdates(assistantMessageId);
            state.setIsLoading(false);
            state.setStreamingMessage(null);
            toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
              clearTimeout(timeoutEntry.softTimeoutId);
              clearTimeout(timeoutEntry.hardTimeoutId);
            });
            toolExecutionTimeoutsRef.current.clear();

            const message = state.messages.find((m) => m.id === assistantMessageId);
            const hasContent = Boolean(message?.content?.trim());
            updateMessage(assistantMessageId, {
              metadata: { streaming: false },
              ...(hasContent
                ? {}
                : {
                    content: 'Response timed out. Please try again.',
                    error: 'stream_watchdog_timeout',
                  }),
            });
          }
          streamWatchdogTimeoutRef.current = null;
        }, WATCHDOG_TIMEOUT_MS);
      };

      if (streamWatchdogTimeoutRef.current) {
        clearTimeout(streamWatchdogTimeoutRef.current);
      }
      scheduleWatchdog();
    }
  };

  const layoutClasses = {
    default: '',
    compact: '',
    immersive: '',
  };

  const handleStopGeneration = async () => {
    // AUDIT-STREAM-059 fix: Clear the stream watchdog when user stops generation
    if (streamWatchdogTimeoutRef.current) {
      clearTimeout(streamWatchdogTimeoutRef.current);
      streamWatchdogTimeoutRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // AUDIT-STREAM-038 fix: Pass conversation ID for scoped stop
    const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
    const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;

    if (isTauri) {
      try {
        await ipcInvoke('chat_stop_generation', { conversationId: conversationDbId });
      } catch (error) {
        console.warn('[UnifiedAgenticChat] Failed to stop generation:', error);
      }
    }

    const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
    if (currentStreamingId) {
      clearQueuedStreamUpdates(currentStreamingId);
      updateMessage(currentStreamingId, {
        metadata: { streaming: false },
      });
    } else {
      clearQueuedStreamUpdates();
    }

    // AUDIT-STREAM-037 fix: Clear per-tool timeout callbacks to prevent stale timeout errors
    toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
      clearTimeout(timeoutEntry.softTimeoutId);
      clearTimeout(timeoutEntry.hardTimeoutId);
    });
    toolExecutionTimeoutsRef.current.clear();

    setIsLoading(false);
    setStreamingMessage(null);
  };

  useEffect(() => {
    const handleNewConversation = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      activeStreamSessionsRef.current.clear();
      toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      toolExecutionTimeoutsRef.current.clear();

      if (isTauri) {
        void ipcInvoke('chat_stop_generation').catch((error: unknown) => {
          console.warn('[UnifiedAgenticChat] Failed to stop generation on new chat:', error);
        });
      }

      const state = useUnifiedChatStore.getState();
      if (state.currentStreamingMessageId) {
        clearQueuedStreamUpdates(state.currentStreamingMessageId);
        updateMessage(state.currentStreamingMessageId, {
          metadata: { streaming: false },
        });
      } else {
        clearQueuedStreamUpdates();
      }
      setIsLoading(false);
      setStreamingMessage(null);
      const unifiedState = useUnifiedChatStore.getState();
      unifiedState.clearActionTrail();
      unifiedState.clearToolStreams();
    };

    window.addEventListener(NEW_CHAT_ABORT_EVENT, handleNewConversation);
    return () => window.removeEventListener(NEW_CHAT_ABORT_EVENT, handleNewConversation);
  }, [clearQueuedStreamUpdates, setIsLoading, setStreamingMessage, updateMessage]);

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
              <BudgetTracker />
              <SectionErrorBoundary
                sectionName="ChatStream"
                fallback={
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center">
                      <p className="text-zinc-400 mb-4">Failed to load chat messages</p>
                      <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
                      >
                        Reload
                      </button>
                    </div>
                  </div>
                }
              >
                <ChatStream
                  onOpenSidecar={openSidecar}
                  onSuggestionClick={(prompt) => {
                    useUnifiedChatStore.getState().setDraftContent(prompt + ' ');
                  }}
                />
              </SectionErrorBoundary>
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
