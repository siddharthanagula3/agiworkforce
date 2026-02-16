/**
 * MessageBubble Component
 *
 * Main component for rendering chat messages. Composes sub-components
 * for header, content, actions, attachments, and widgets.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';
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
import { ThinkingMessageBlock } from './ThinkingMessageBlock';
import { InlinePanelList } from './InlinePanelList';
import { WidgetList, WidgetData } from './WidgetList';

// Hooks
import { useMessageActions } from './useMessageActions';
import { useMessageReactions } from './useMessageReactions';

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
    useCallback((state) => {
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
    }, [toolName, actionId]),
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

  // Open sidecar for new messages
  useEffect(() => {
    if (!sidecar.autoTrigger || sidecar.isOpen) return;
    if (processedMessageIdsRef.current.has(message.id)) return;

    const suggestedMode = getSuggestedSidecarMode(message);
    if (suggestedMode) {
      processedMessageIdsRef.current.add(message.id);
      openSidecar(suggestedMode, message.id);
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
      const statusText = isExecuting ? toolDisplayInfo.activeForm : toolDisplayInfo.completedForm;

      return (
        <div className={cn('px-4 py-2', embedded && 'pl-14')}>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="animate-pulse">•</div>
            <span>{statusText}</span>
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

              const resultUI: ToolResultUI = {
                tool_call_id: actionId || 'unknown', // Should exist if toolState exists
                success: success,
                data: resultData || errorData || 'No output',
                error: errorData,
                output_type: typeof resultData === 'object' ? 'json' : 'text',
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
                    (message.metadata as Record<string, unknown> | undefined)
                      ?.['toolWidgets']) as WidgetData[]
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
              canEdit={!!(onEdit || onEditSave)}
              canRegenerate={!!onRegenerate}
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
