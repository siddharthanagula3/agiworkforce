/**
 * MessageBubble Component
 *
 * Main component for rendering chat messages. Composes sub-components
 * for header, content, actions, attachments, and widgets.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { invoke } from '../../../lib/tauri-mock';
import { useUnifiedChatStore, uuidToDbId } from '../../../stores/unifiedChatStore';
import { useExecutionStore } from '../../../stores/executionStore';
import { useToolStore } from '../../../stores/chat/toolStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { getToolDisplayInfo } from '../../../lib/toolDisplayNames';
import { EditableMessage } from '../EditableMessage';
import { DeepResearchPanel } from '../DeepResearchPanel';
import { ImageLightbox } from '../ImageLightbox';
import { StatusTrail } from '../StatusTrail';

// Sub-components
import { MessageHeader } from './MessageHeader';
import { MessageContent } from './MessageContent';
import { MessageActions } from './MessageActions';
import { MessageAttachments } from './MessageAttachments';
import { MessageContextMenu } from './MessageContextMenu';
import { MessageAvatar } from './MessageAvatar';
import { ToolCallCard } from './ToolCallCard';
import { ToolResultCard } from '../../ToolCalling/ToolResultCard';
import type { ToolResultUI } from '../../../types/toolCalling';
import { McpAppCard } from '../../MCP/McpAppCard';
import { useMcpAppStore } from '../../../stores/mcpAppStore';
import type { McpAppContent } from '../../../stores/mcpAppStore';
import { hasInlineRenderer } from '../InlineToolResults';
import { ThinkingMessageBlock } from './ThinkingMessageBlock';
import { InlinePanelList } from './InlinePanelList';
import { WidgetList, WidgetData } from './WidgetList';

// Hooks
import { useMessageActions } from './useMessageActions';
import { useMessageReactions } from './useMessageReactions';
import { useTTS } from '../../../hooks/useTTS';

// Types
import { MessageBubbleProps, ThinkingMatch, LightboxImage, ContextMenuPosition } from './types';

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: Date): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Show relative time for recent messages
  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24 && date.getDate() === now.getDate()) {
    // Same day - show time
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (diffDays < 7) {
    // Within a week - show day and time
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } else {
    // Older - show full date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Parse thinking blocks from message content
 */
function parseThinkingContent(
  content: string,
  metadata?: Record<string, unknown>,
): ThinkingMatch | null {
  const explicit = metadata?.['type'] === 'reasoning';

  // Support multiple thinking tag formats from different providers
  const thinkingPatterns = [
    // Anthropic style: <thinking>...</thinking>
    /<thinking>([\s\S]*?)(?:<\/thinking>|$)/i,
    // Anthropic alternate: <antthinking>...</antthinking>
    /<antthinking>([\s\S]*?)(?:<\/antthinking>|$)/i,
    // DeepSeek style: <think>...</think>
    /<think>([\s\S]*?)(?:<\/think>|$)/i,
    // OpenAI style brackets: [THINKING]...[/THINKING]
    /\[THINKING\]([\s\S]*?)(?:\[\/THINKING\]|$)/i,
    // Claude internal reasoning: <reasoning>...</reasoning>
    /<reasoning>([\s\S]*?)(?:<\/reasoning>|$)/i,
    // Chain of thought markers
    /<cot>([\s\S]*?)(?:<\/cot>|$)/i,
  ];

  // Try each pattern and return the first match
  for (const regex of thinkingPatterns) {
    const match = regex.exec(content);
    if (match && (match[1]?.trim() || metadata?.['streaming'])) {
      return {
        content: match[1]?.trim() || '',
        pattern: regex.source.slice(1, regex.source.indexOf('>')),
        fullMatch: match[0],
      };
    }
  }

  // If explicitly marked as reasoning type, use entire content
  if (explicit) {
    return {
      content: content,
      pattern: 'explicit',
      fullMatch: content,
    };
  }

  return null;
}

type CompactToolOutput = {
  command: string;
  stdout: string;
  stderr: string;
  error: string;
  raw: string;
};

function asNonEmptyString(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse errors and treat as plain text.
  }
  return null;
}

function extractCompactToolOutput(
  artifact: Record<string, unknown> | undefined,
  message: { content: string; error?: string; metadata?: unknown },
  isFailed: boolean,
): CompactToolOutput {
  const metadataRecord =
    message.metadata && typeof message.metadata === 'object'
      ? (message.metadata as Record<string, unknown>)
      : {};
  const rawArtifactContent = asNonEmptyString(artifact?.['content']);
  const parsedFromRaw =
    rawArtifactContent.startsWith('{') && rawArtifactContent.endsWith('}')
      ? parseJsonRecord(rawArtifactContent)
      : null;
  const source = parsedFromRaw ?? artifact ?? {};

  const command = asNonEmptyString(source['command']);
  const stdout = asNonEmptyString(source['stdout']) || asNonEmptyString(source['output']);
  const stderr = asNonEmptyString(source['stderr']);
  const error =
    asNonEmptyString(artifact?.['error']) ||
    asNonEmptyString(source['error']) ||
    asNonEmptyString(source['message']) ||
    asNonEmptyString(message.error) ||
    asNonEmptyString(metadataRecord['error']) ||
    (isFailed ? 'Tool execution failed.' : '');
  const raw =
    rawArtifactContent ||
    asNonEmptyString(message.content) ||
    asNonEmptyString(source['result']) ||
    asNonEmptyString(source['text']);

  return { command, stdout, stderr, error, raw };
}

function buildCompactToolCopyText(output: CompactToolOutput): string {
  const sections: string[] = [];
  if (output.command) sections.push(`$ ${output.command}`);
  if (output.stdout) sections.push(output.stdout);
  if (output.stderr) sections.push(`STDERR:\n${output.stderr}`);
  if (output.error) sections.push(`ERROR:\n${output.error}`);
  if (sections.length === 0 && output.raw) sections.push(output.raw);
  return sections.join('\n\n');
}

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  showAvatar = true,
  showTimestamp = true,
  enableActions = true,
  onRegenerate,
  onEdit,
  onEditSave,
  onDelete,
  onCopy,
  onToggleSidecar,
}) => {
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const [compactToolExpanded, setCompactToolExpanded] = useState(false);
  const [compactToolCopied, setCompactToolCopied] = useState(false);

  // Store hooks
  const getSuggestedSidecarMode = useUnifiedChatStore((state) => state.getSuggestedSidecarMode);
  const openSidecar = useUnifiedChatStore((state) => state.openSidecar);
  const sidecar = useUnifiedChatStore((state) => state.sidecar);
  const researchTasks = useExecutionStore((state) => state.researchTasks);

  // Tool Call Actions ID - Hoisted for store access
  const actionId =
    message.metadata?.actionId || (message.metadata?.action_id as string | undefined);

  // Track tool state from store for real-time updates
  const toolState = useToolStore(
    useCallback(
      (state) => {
        if (!actionId) return null;
        return (
          state.activeToolStreams.get(actionId) ||
          state.toolExecutions.find((e) => e.id === actionId)
        );
      },
      [actionId],
    ),
  );

  // Track which message IDs we've already opened the sidecar for
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  // Message type checks
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  // Action hooks
  const {
    copied,
    handleCopy,
    handleBookmark,
    isEditing,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleRetry,
    showActions,
    setShowActions,
  } = useMessageActions({
    messageId: message.id,
    content: message.content,
    bookmarked: message.bookmarked,
    onCopy,
    onEdit,
    onEditSave,
    onRegenerate,
  });

  const {
    reactions: reactionConfigs,
    showReactionPicker,
    setShowReactionPicker,
    handleReaction,
  } = useMessageReactions({ messageId: message.id });

  const { isSpeaking, isSupported: ttsSupported, speak: ttsSpeak } = useTTS();
  const handleSpeak = useCallback(() => {
    ttsSpeak(message.content);
  }, [ttsSpeak, message.content]);

  const activeConversationId = useUnifiedChatStore((state) => state.activeConversationId);

  const handleFork = useCallback(async () => {
    try {
      const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;
      await invoke('checkpoint_create', {
        conversationId: conversationDbId,
        messageId: message.id,
        branchName: `fork-${Date.now()}`,
        label: `Fork from message ${message.id.slice(0, 8)}`,
      });
      toast.success('Conversation forked — new branch created');
    } catch {
      toast.error('Failed to fork conversation');
    }
  }, [message.id, activeConversationId]);

  // Memoized values
  const formattedTime = useMemo(() => formatTimestamp(message.timestamp), [message.timestamp]);

  const thinkingMatch = useMemo(
    () =>
      parseThinkingContent(
        message.content,
        message.metadata as Record<string, unknown> | undefined,
      ),
    [message.content, message.metadata],
  );

  const isToolCall = useMemo(() => {
    const meta = message.metadata;
    return !!(meta?.tool || meta?.tool_call || meta?.event === 'tool');
  }, [message.metadata]);

  // Tool call metadata
  const toolName = message.metadata?.tool || message.metadata?.tool_call || message.metadata?.name;

  // AUDIT-UI-052: Look up pending approval request ID for this tool
  const pendingApprovalId = useToolStore(
    useCallback(
      (state) => {
        if (!toolName && !actionId) return undefined;
        // Find a pending approval that matches this tool
        const pending = state.pendingApprovals.find(
          (a) =>
            a.status === 'pending' &&
            ((a.details['toolName'] as string | undefined) === toolName ||
              (a.details['tool'] as string | undefined) === toolName ||
              a.actionId === actionId),
        );
        return pending?.id;
      },
      [toolName, actionId],
    ),
  );

  // Derive status from store if available, otherwise fallback to metadata
  const toolStatus = useMemo(() => {
    if (toolState) {
      if ('status' in toolState) return toolState.status; // ToolStreamStateEntry
      return toolState.success ? 'completed' : 'failed'; // ToolExecution
    }
    return message.metadata?.status || message.metadata?.state || message.metadata?.stage;
  }, [toolState, message.metadata]);

  const toolCommand = message.metadata?.command || message.content;
  const requiresApproval = Boolean(message.metadata?.requiresApproval);

  // Research task
  const researchTaskId = message.metadata?.taskId;
  const isResearchTask = message.metadata?.type === 'deep-research-task';
  const researchTask = researchTaskId ? researchTasks[researchTaskId as string] : null;

  // Reset compact tool display state when message changes
  useEffect(() => {
    setCompactToolExpanded(false);
    setCompactToolCopied(false);
  }, [message.id]);

  const handleCompactToolCopy = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCompactToolCopied(true);
      window.setTimeout(() => setCompactToolCopied(false), 1500);
    } catch {
      setCompactToolCopied(false);
    }
  }, []);

  // Open sidecar for new messages
  useEffect(() => {
    // Auto-trigger sidecar for assistant outputs only.
    if (message.role !== 'assistant') return;
    if (!sidecar.autoTrigger || sidecar.isOpen) return;
    if (processedMessageIdsRef.current.has(message.id)) return;

    const suggestedMode = getSuggestedSidecarMode(message);
    if (suggestedMode) {
      processedMessageIdsRef.current.add(message.id);
      openSidecar(suggestedMode, message.id, {
        messageId: message.id,
        content: message.content,
      });
    }
  }, [message, getSuggestedSidecarMode, openSidecar, sidecar.autoTrigger, sidecar.isOpen]);

  // Event handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleImageClick = useCallback((image: LightboxImage) => {
    setLightboxImage(image);
  }, []);

  // Render research task
  if (isResearchTask && researchTask) {
    return (
      <div className="group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">
        {showAvatar && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-medium">
            AI
          </div>
        )}
        <div className="min-w-0 relative max-w-full flex-1">
          <DeepResearchPanel task={researchTask} />
        </div>
      </div>
    );
  }

  // Pre-render tool call content to share between standalone and dual-mode (thinking + tool)
  const renderToolCall = (embedded = false) => {
    const compactMode = useSettingsStore.getState().chatPreferences.compactMode;

    // In compact mode, show simple status message
    if (compactMode) {
      const toolDisplayInfo = getToolDisplayInfo(toolName);
      const isExecuting = toolStatus === 'running' || toolStatus === 'executing';
      const isCompleted = toolStatus === 'completed' || toolStatus === 'success';
      const isFailed =
        toolStatus === 'failed' || toolStatus === 'failure' || toolStatus === 'error';
      const statusText = isExecuting ? toolDisplayInfo.activeForm : toolDisplayInfo.completedForm;

      // Compact mode should still surface tool output/error, otherwise successful
      // tool-only runs appear as a status line with no actionable result.
      const metadataArtifactsRaw = Array.isArray(message.metadata?.artifacts)
        ? (message.metadata?.artifacts as unknown[])
        : [];
      const artifacts = [
        ...(message.artifacts || []),
        ...metadataArtifactsRaw.filter(
          (artifact) =>
            !(message.artifacts || []).some((existing) => {
              const existingRecord = existing as unknown as Record<string, unknown>;
              const artifactRecord = artifact as Record<string, unknown>;
              return (
                String(existingRecord['id'] || '') === String(artifactRecord['id'] || '') ||
                String(existingRecord['content'] || '') === String(artifactRecord['content'] || '')
              );
            }),
        ),
      ] as Array<Record<string, unknown>>;

      const toolCallId = String(actionId || message.metadata?.tool_call || '');
      const matchedArtifact =
        artifacts.find((artifact) => String(artifact['id'] || '') === toolCallId) ||
        artifacts[artifacts.length - 1];
      const compactOutput = extractCompactToolOutput(matchedArtifact, message, isFailed);
      const copyText = buildCompactToolCopyText(compactOutput);
      const collapsedBodySource =
        compactOutput.stdout || compactOutput.stderr || compactOutput.error || compactOutput.raw;
      const collapsedBodyLines = collapsedBodySource ? collapsedBodySource.split('\n') : [];
      const collapsedBodyPreview = collapsedBodyLines.slice(0, 3).join('\n').trim();
      const hiddenLineCount = Math.max(collapsedBodyLines.length - 3, 0);
      // If a rich inline renderer handles this tool (e.g. InlineSearchResults for search_web),
      // suppress the raw JSON body — the formatted cards are shown separately.
      const toolHasRichRenderer = toolName ? hasInlineRenderer(toolName as string) : false;

      return (
        <div className={cn('px-4 py-2', embedded && 'pl-14')}>
          <div className="rounded-lg border border-border/50 overflow-hidden bg-surface-elevated">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{statusText}</p>
                {compactOutput.command ? (
                  <p className="text-xs font-mono text-emerald-400 truncate">
                    $ {compactOutput.command}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCompactToolCopy(copyText)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
                  title="Copy full output"
                  aria-label="Copy full output"
                >
                  {compactToolCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCompactToolExpanded((open) => !open)}
                  className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
                  title={compactToolExpanded ? 'Collapse output' : 'Expand output'}
                >
                  {compactToolExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {compactToolExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>

            {(isCompleted || isFailed) && !toolHasRichRenderer && (
              <div className="px-3 py-2 bg-black/50 font-mono text-xs text-zinc-200">
                {!compactToolExpanded ? (
                  <>
                    <pre className="whitespace-pre-wrap break-words">
                      {collapsedBodyPreview || 'No output'}
                    </pre>
                    {hiddenLineCount > 0 ? (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        +{hiddenLineCount} more lines
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2">
                    {compactOutput.stdout ? (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">
                          stdout
                        </p>
                        <pre className="whitespace-pre-wrap break-words text-zinc-200">
                          {compactOutput.stdout}
                        </pre>
                      </div>
                    ) : null}
                    {compactOutput.stderr ? (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-amber-400">
                          stderr
                        </p>
                        <pre className="whitespace-pre-wrap break-words text-amber-200">
                          {compactOutput.stderr}
                        </pre>
                      </div>
                    ) : null}
                    {compactOutput.error ? (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-red-400">
                          error
                        </p>
                        <pre className="whitespace-pre-wrap break-words text-red-300">
                          {compactOutput.error}
                        </pre>
                      </div>
                    ) : null}
                    {!compactOutput.stdout && !compactOutput.stderr && !compactOutput.error ? (
                      <pre className="whitespace-pre-wrap break-words text-zinc-200">
                        {compactOutput.raw || 'No output'}
                      </pre>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        className="group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* If embedded (under thinking), hide avatar or show invisible spacer if needed for alignment */}
        {showAvatar &&
          (embedded ? (
            <div className="w-8 shrink-0" />
          ) : (
            <MessageAvatar isUser={isUser} isSystem={isSystem} />
          ))}

        <div className="flex-1">
          <ToolCallCard
            messageId={message.id}
            toolName={toolName as string | undefined}
            toolStatus={toolStatus as string | undefined}
            toolCommand={toolCommand as string | undefined}
            requiresApproval={requiresApproval}
            actionId={actionId as string | undefined}
            confirmationRequestId={pendingApprovalId}
            onToggleSidecar={onToggleSidecar}
          />

          {/* Render Result if available and completed */}
          {(() => {
            const isCompleted = toolStatus === 'completed' || toolStatus === 'success';
            const isFailed =
              toolStatus === 'failed' || toolStatus === 'failure' || toolStatus === 'error';

            if ((isCompleted || isFailed) && toolState) {
              let resultData: any;
              let success = false;

              if ('status' in toolState) {
                // ToolStreamStateEntry
                resultData = toolState.result || toolState.outputBuffer;
                success = toolState.status === 'completed';
              } else {
                // ToolExecution
                resultData = toolState.output;
                success = toolState.success;
              }

              const errorData = toolState.error;

              // Detect image generation tool results and render them inline
              const isImageTool = (() => {
                const n = (toolName || '').toString().toLowerCase();
                return (
                  n === 'image_generate' ||
                  n === 'media_generate_image' ||
                  n === 'text_to_image' ||
                  n.includes('generate_image') ||
                  n.includes('image_generation')
                );
              })();

              const imageArtifacts = (() => {
                if (!isImageTool || !resultData) return undefined;
                try {
                  const parsed =
                    typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
                  const images: Array<{ url?: string; b64_json?: string }> = Array.isArray(
                    parsed?.images,
                  )
                    ? parsed.images
                    : [];
                  if (images.length === 0) return undefined;
                  return images.map((img, idx) => ({
                    id: `gen-img-${idx}`,
                    type: 'image' as const,
                    name: `generated-image-${idx + 1}.png`,
                    url: img.url,
                    data: img.b64_json,
                    mime_type: 'image/png',
                  }));
                } catch {
                  return undefined;
                }
              })();

              // ── MCP App detection ─────────────────────────────────────────
              // If the result contains a __mcp_app key, register + render as
              // a sandboxed interactive app instead of a plain JSON result card.
              const mcpAppPayload = (() => {
                if (!resultData) return null;
                try {
                  const parsed: unknown =
                    typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
                  if (
                    parsed &&
                    typeof parsed === 'object' &&
                    !Array.isArray(parsed) &&
                    '__mcp_app' in (parsed as Record<string, unknown>)
                  ) {
                    return (parsed as Record<string, unknown>)['__mcp_app'] as McpAppContent;
                  }
                } catch {
                  // Not JSON — not an MCP app payload
                }
                return null;
              })();

              if (mcpAppPayload && success) {
                // Register the app in the store (idempotent via actionId key check)
                const registerApp = useMcpAppStore.getState().registerApp;
                const existingApps = useMcpAppStore.getState().apps;
                // Access mcpServer via unknown cast since it's not in the typed interface
                const metaRecord = (message.metadata ?? {}) as Record<string, unknown>;
                const mcpServerName = String(metaRecord['mcpServer'] ?? 'mcp');
                // Avoid duplicate registrations for the same tool call
                const existingEntry = Object.values(existingApps).find(
                  (a) => a.toolName === String(toolName || '') && a.mcpServer === mcpServerName,
                );
                const appId = existingEntry
                  ? existingEntry.id
                  : registerApp(String(toolName || 'mcp_tool'), mcpServerName, mcpAppPayload);

                const app = useMcpAppStore.getState().apps[appId];
                if (app) {
                  return (
                    <div className="mt-3">
                      <McpAppCard app={app} />
                    </div>
                  );
                }
              }

              const resultUI: ToolResultUI = {
                tool_call_id: actionId || 'unknown', // Should exist if toolState exists
                success: success,
                data: resultData || errorData || 'No output',
                error: errorData,
                output_type: imageArtifacts
                  ? 'image'
                  : typeof resultData === 'object'
                    ? 'json'
                    : 'text',
                artifacts: imageArtifacts,
              };

              return (
                <div className="mt-3">
                  <ToolResultCard result={resultUI} />
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    );
  };

  // Render thinking message (plus optional tool call)
  if (thinkingMatch) {
    return (
      <div className="flex flex-col">
        <>
          <ImageLightbox
            isOpen={!!lightboxImage}
            onClose={() => setLightboxImage(null)}
            src={lightboxImage?.src || ''}
            alt={lightboxImage?.alt}
          />
          <ThinkingMessageBlock
            message={message}
            thinkingMatch={thinkingMatch}
            showAvatar={showAvatar}
            showActions={showActions}
            enableActions={enableActions}
            copied={copied}
            onCopy={handleCopy}
            onBookmark={handleBookmark}
            onImageClick={handleImageClick}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
          />
        </>
        {/* If this message also has a tool call, render it below the thinking block */}
        {isToolCall && renderToolCall(true)}
      </div>
    );
  }

  // Render standalone tool call
  if (isToolCall) {
    return renderToolCall(false);
  }

  // Render standard message
  return (
    <>
      {/* Image Lightbox */}
      <ImageLightbox
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        src={lightboxImage?.src || ''}
        alt={lightboxImage?.alt}
      />

      {/* Context Menu */}
      <MessageContextMenu
        position={contextMenu}
        onClose={closeContextMenu}
        bookmarked={message.bookmarked}
        isUser={isUser}
        isAssistant={isAssistant}
        hasError={!!message.error}
        onCopy={handleCopy}
        onBookmark={handleBookmark}
        onEdit={handleStartEdit}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
        canEdit={!!(onEdit || onEditSave)}
      />

      <div
        className={`message-bubble group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors ${
          isUser ? 'flex-row-reverse' : ''
        }`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        onContextMenu={handleContextMenu}
      >
        {showAvatar && !isUser && <MessageAvatar isUser={isUser} isSystem={isSystem} />}

        <div className={cn('min-w-0 relative', isUser ? 'max-w-[60%] ml-auto' : 'flex-1')}>
          {/* Header */}
          <MessageHeader
            message={message}
            isUser={isUser}
            isSystem={isSystem}
            isAssistant={isAssistant}
            showTimestamp={showTimestamp}
            formattedTime={formattedTime}
          />

          {/* Status Trail for streaming */}
          {message.metadata?.streaming && <StatusTrail messageId={message.id} />}

          {/* Edit mode for user messages */}
          {isUser && isEditing ? (
            <EditableMessage
              initialContent={message.content}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
              className="mt-2"
            />
          ) : (
            <MessageContent
              message={message}
              isUser={isUser}
              isStreaming={Boolean(message.metadata?.streaming)}
            />
          )}

          {/* Attachments */}
          {Array.isArray(message.attachments) && message.attachments.length > 0 && (
            <MessageAttachments attachments={message.attachments} onImageClick={handleImageClick} />
          )}

          {/* Inline Panels */}
          {message.inlinePanels && message.inlinePanels.length > 0 && (
            <InlinePanelList messageId={message.id} panels={message.inlinePanels} />
          )}

          {/* Embedded Widgets (INT-001) */}
          {(() => {
            const metadata = message.metadata as Record<string, unknown> | undefined;
            const widgets = Array.isArray(metadata?.['widgets'])
              ? (metadata?.['widgets'] as WidgetData[])
              : Array.isArray(metadata?.['toolWidgets'])
                ? (metadata?.['toolWidgets'] as WidgetData[])
                : [];

            return widgets.length > 0;
          })() && (
            <WidgetList
              messageId={message.id}
              widgets={
                ((message.metadata as Record<string, unknown> | undefined)?.['widgets'] ||
                  (message.metadata as Record<string, unknown> | undefined)?.[
                    'toolWidgets'
                  ]) as WidgetData[]
              }
              isAssistant={isAssistant}
              isStreaming={Boolean(message.metadata?.streaming)}
            />
          )}

          {/* Action buttons */}
          {enableActions && (
            <MessageActions
              showActions={showActions}
              copied={copied}
              bookmarked={message.bookmarked}
              isEditing={isEditing}
              reactions={message.reactions}
              isAssistant={isAssistant}
              isUser={isUser}
              hasError={!!message.error}
              reactionConfigs={reactionConfigs}
              showReactionPicker={showReactionPicker}
              onToggleReactionPicker={() => setShowReactionPicker(!showReactionPicker)}
              onReaction={handleReaction}
              onCopy={handleCopy}
              onBookmark={handleBookmark}
              onRegenerate={onRegenerate}
              onRetry={handleRetry}
              onStartEdit={handleStartEdit}
              onDelete={onDelete}
              onSpeak={isAssistant ? handleSpeak : undefined}
              onFork={handleFork}
              canEdit={!!(onEdit || onEditSave)}
              canRegenerate={!!onRegenerate}
              isSpeaking={isSpeaking}
              ttsSupported={ttsSupported}
              messageContent={isAssistant ? message.content : undefined}
            />
          )}
        </div>
      </div>
    </>
  );
};

MessageBubbleComponent.displayName = 'MessageBubble';

export const MessageBubble = memo(MessageBubbleComponent);
export default MessageBubble;
