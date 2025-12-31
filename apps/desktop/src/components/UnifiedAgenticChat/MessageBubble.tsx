import 'katex/dist/katex.min.css';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  FileText,
  Globe2,
  Heart,
  Image,
  Laugh,
  Lightbulb,
  Loader2,
  PartyPopper,
  RotateCw,
  SmilePlus,
  Terminal as TerminalIcon,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { emit, isTauri } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import {
  EnhancedMessage,
  MessageReaction,
  SidecarMode,
  useUnifiedChatStore,
} from '../../stores/unifiedChatStore';
import { parseCitations } from './CitationBadge';
import { ReasoningAccordion } from './ReasoningAccordion';
import { StatusTrail } from './StatusTrail';

import { useExecutionStore } from '../../stores/executionStore';
import { DeepResearchPanel } from './DeepResearchPanel';
import { CodeBlock } from './Visualizations/CodeBlock';
import { ImageLightbox } from './ImageLightbox';
import { InlinePanelRenderer } from './InlinePanels/InlinePanelRenderer';

export interface MessageBubbleProps {
  message: EnhancedMessage;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onToggleSidecar?: (tab: SidecarMode) => void;
}

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  showAvatar = true,
  showTimestamp = true,
  enableActions = true,
  onRegenerate,
  onEdit,
  onDelete,
  onCopy,
  onToggleSidecar,
}) => {
  const [showActions, setShowActions] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [lightboxImage, setLightboxImage] = React.useState<{ src: string; alt: string } | null>(
    null,
  );
  const getSuggestedSidecarMode = useUnifiedChatStore((state) => state.getSuggestedSidecarMode);
  const openSidecar = useUnifiedChatStore((state) => state.openSidecar);
  const sidecar = useUnifiedChatStore((state) => state.sidecar);
  const retryFailedMessage = useUnifiedChatStore((state) => state.retryFailedMessage);
  const toggleMessageBookmark = useUnifiedChatStore((state) => state.toggleMessageBookmark);
  const toggleMessageReaction = useUnifiedChatStore((state) => state.toggleMessageReaction);

  // Reaction picker state
  const [showReactionPicker, setShowReactionPicker] = React.useState(false);

  // Reaction config
  const REACTIONS: { type: MessageReaction; icon: React.ReactNode; label: string }[] = [
    { type: 'thumbsUp', icon: <ThumbsUp size={14} />, label: 'Like' },
    { type: 'thumbsDown', icon: <ThumbsDown size={14} />, label: 'Dislike' },
    { type: 'heart', icon: <Heart size={14} />, label: 'Love' },
    { type: 'laugh', icon: <Laugh size={14} />, label: 'Funny' },
    { type: 'thinking', icon: <Lightbulb size={14} />, label: 'Insightful' },
    { type: 'celebrate', icon: <PartyPopper size={14} />, label: 'Celebrate' },
  ];

  const handleReaction = useCallback(
    (reaction: MessageReaction) => {
      toggleMessageReaction(message.id, reaction);
      setShowReactionPicker(false);
    },
    [message.id, toggleMessageReaction],
  );

  const researchTasks = useExecutionStore((state) => state.researchTasks);

  React.useEffect(() => {
    if (!sidecar.autoTrigger || sidecar.isOpen) return;

    const suggestedMode = getSuggestedSidecarMode(message);
    if (suggestedMode) {
      openSidecar(suggestedMode, message.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when message ID changes, not on every message property update to prevent unnecessary sidecar opens during streaming
  }, [message.id, getSuggestedSidecarMode, openSidecar, sidecar.autoTrigger, sidecar.isOpen]);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  const avatarBg = useMemo(
    () => (isUser ? 'bg-blue-600' : isSystem ? 'bg-zinc-600' : 'bg-purple-600'),
    [isUser, isSystem],
  );

  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
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
  }, [message.timestamp]);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('Message copied', {
        icon: <Check className="h-4 w-4" />,
        duration: 2000,
      });
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy message:', err);
      toast.error('Failed to copy message');
    }
  }, [message.content, onCopy]);

  const handleRetry = useCallback(() => {
    retryFailedMessage(message.id);

    onRegenerate?.();
  }, [message.id, retryFailedMessage, onRegenerate]);

  const handleBookmark = useCallback(() => {
    toggleMessageBookmark(message.id);
    toast.success(message.bookmarked ? 'Bookmark removed' : 'Message bookmarked', {
      icon: message.bookmarked ? (
        <Bookmark className="h-4 w-4" />
      ) : (
        <BookmarkCheck className="h-4 w-4" />
      ),
      duration: 2000,
    });
  }, [message.id, message.bookmarked, toggleMessageBookmark]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu on click outside
  React.useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => closeContextMenu();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, closeContextMenu]);

  // Close reaction picker on click outside
  React.useEffect(() => {
    if (!showReactionPicker) return;

    const handleClick = () => setShowReactionPicker(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowReactionPicker(false);
    };
    // Small delay to prevent immediate close when opening
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleEscape);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showReactionPicker]);

  // Enhanced thinking block detection supporting multiple formats
  const thinkingMatch = useMemo(() => {
    const explicit = message.metadata?.type === 'reasoning';
    const content = message.content;

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
      if (match && (match[1]?.trim() || message.metadata?.streaming)) {
        return {
          content: match[1]?.trim() || '',
          pattern: regex.source.slice(1, regex.source.indexOf('>')), // Extract tag name
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
  }, [message]);

  const isToolCall = useMemo(() => {
    const meta = message.metadata;
    return !!(meta?.tool || meta?.tool_call || meta?.event === 'tool');
  }, [message.metadata]);

  const toolName = message.metadata?.tool || message.metadata?.tool_call || message.metadata?.name;
  const toolStatus = message.metadata?.status || message.metadata?.state || message.metadata?.stage;
  const toolCommand = message.metadata?.command || message.content;
  const requiresApproval = Boolean(message.metadata?.requiresApproval);
  const actionId = message.metadata?.actionId || message.metadata?.action_id;
  const [approvalState, setApprovalState] = React.useState<
    'idle' | 'approving' | 'denying' | 'approved' | 'denied'
  >('idle');

  const renderToolCard = () => {
    const isExecuting = toolStatus === 'running' || toolStatus === 'executing';
    const statusIcon =
      toolStatus === 'success' || toolStatus === 'completed' || approvalState === 'approved' ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      ) : isExecuting ? (
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      );

    const lowerTool = (toolName || '').toString().toLowerCase();
    const targetTab: SidecarMode = lowerTool.includes('browser')
      ? 'browser'
      : lowerTool.includes('file') || lowerTool.includes('read') || lowerTool.includes('edit')
        ? 'code'
        : lowerTool.includes('image') || lowerTool.includes('video') || lowerTool.includes('media')
          ? 'preview'
          : lowerTool.includes('code')
            ? 'code'
            : 'terminal';

    const icon =
      targetTab === 'browser' ? (
        <Globe2 className="h-4 w-4" />
      ) : targetTab === 'code' ? (
        <FileText className="h-4 w-4" />
      ) : targetTab === 'preview' ? (
        <Image className="h-4 w-4" />
      ) : (
        <TerminalIcon className="h-4 w-4" />
      );

    const statusLabel =
      approvalState === 'approving'
        ? 'approving'
        : approvalState === 'denying'
          ? 'denying'
          : approvalState === 'approved'
            ? 'approved'
            : approvalState === 'denied'
              ? 'denied'
              : toolStatus || 'running';

    const cardClasses = requiresApproval
      ? 'rounded-2xl border border-amber-500/60 bg-amber-500/5 px-4 py-3 shadow-lg shadow-black/30'
      : 'rounded-2xl border border-white/5 bg-black/60 px-4 py-3 shadow-lg shadow-black/30';

    const emitAction = async (eventName: string) => {
      if (!isTauri) {
        console.log(`[MessageBubble] Emit ${eventName}`, {
          actionId,
          toolName,
          messageId: message.id,
        });
        return;
      }
      await emit(eventName, { actionId, tool: toolName, messageId: message.id });
    };

    const handleApprove = async () => {
      try {
        setApprovalState('approving');
        await emitAction('resume_agent');
        setApprovalState('approved');
      } catch (error) {
        console.error('[MessageBubble] Failed to approve action', error);
        setApprovalState('idle');
      }
    };

    const handleDeny = async () => {
      try {
        setApprovalState('denying');
        await emitAction('cancel_action');
        setApprovalState('denied');
      } catch (error) {
        console.error('[MessageBubble] Failed to deny action', error);
        setApprovalState('idle');
      }
    };

    return (
      <div className={cardClasses}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-100">
            {icon}
            <span className="font-semibold">{toolName || 'Tool call'}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
              {statusIcon}
              <span className="capitalize">{statusLabel}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleSidecar?.(targetTab)}
              className="rounded-lg border border-white/5 px-3 py-1 text-xs font-semibold text-zinc-100 hover:border-zinc-500"
            >
              View Output
            </button>
            {requiresApproval && (
              <>
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={approvalState === 'approving' || approvalState === 'approved'}
                  className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:border-emerald-500/80 disabled:opacity-60"
                >
                  {approvalState === 'approving'
                    ? 'Approving...'
                    : approvalState === 'approved'
                      ? 'Approved'
                      : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeny()}
                  disabled={approvalState === 'denying' || approvalState === 'denied'}
                  className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 transition hover:border-red-500/80 disabled:opacity-60"
                >
                  {approvalState === 'denying'
                    ? 'Denying...'
                    : approvalState === 'denied'
                      ? 'Denied'
                      : 'Deny'}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 truncate text-sm text-zinc-300" title={toolCommand}>
          {toolCommand}
        </p>
      </div>
    );
  };

  const researchTaskId = (message.metadata as any)?.taskId;
  const isResearchTask =
    (message.metadata as any)?.type === 'deep-research' ||
    (message.metadata as any)?.type === 'deep-research-task';
  const researchTask = researchTaskId ? researchTasks[researchTaskId] : null;

  if (isResearchTask && researchTask) {
    return (
      <div className="group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">
        {showAvatar && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-medium">
            AI
          </div>
        )}
        <div className="min-w-0 relative max-w-full flex-1">
          <DeepResearchPanel task={researchTask} />
        </div>
      </div>
    );
  }

  if (thinkingMatch) {
    const summary =
      (message.metadata as any)?.thinkingSummary || (message.metadata as any)?.summary;
    const duration = (message.metadata as any)?.duration;
    const steps = (message.metadata as any)?.steps;

    const thinkingBlock = thinkingMatch.content;

    // Remove all thinking-related tags from the remaining content
    const remainingContent = message.content
      .replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, '')
      .replace(/<antthinking>[\s\S]*?(?:<\/antthinking>|$)/gi, '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/\[THINKING\][\s\S]*?(?:\[\/THINKING\]|$)/gi, '')
      .replace(/<reasoning>[\s\S]*?(?:<\/reasoning>|$)/gi, '')
      .replace(/<cot>[\s\S]*?(?:<\/cot>|$)/gi, '')
      .trim();

    return (
      <>
        <ImageLightbox
          isOpen={!!lightboxImage}
          onClose={() => setLightboxImage(null)}
          src={lightboxImage?.src || ''}
          alt={lightboxImage?.alt}
        />
        <div
          className="group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors"
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => setShowActions(false)}
        >
          {showAvatar && (
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-700 text-white text-sm font-medium">
              AI
            </div>
          )}
          <div className="min-w-0 relative max-w-full flex-1">
            {}
            <StatusTrail messageId={message.id} />

            {/* Reasoning Accordion */}
            <ReasoningAccordion
              content={thinkingBlock}
              summary={summary}
              metadata={{ duration, steps, thinkingPattern: thinkingMatch.pattern }}
              isStreaming={Boolean(message.metadata?.streaming)}
            />

            {}
            {remainingContent && (
              <div className="prose prose-sm dark:prose-invert max-w-none mt-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code(props) {
                      const { inline, className, children, ...rest } =
                        props as React.HTMLAttributes<HTMLElement> & { inline?: boolean };
                      const match = /language-(\w+)/.exec(className || '');
                      const language = match ? match[1] : 'text';
                      const code = String(children).replace(/\n$/, '');

                      return !inline ? (
                        <CodeBlock
                          code={code}
                          language={language || 'text'}
                          showLineNumbers={true}
                          enableCopy={true}
                        />
                      ) : (
                        <code
                          className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono"
                          {...rest}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {remainingContent}
                </ReactMarkdown>
              </div>
            )}

            {}
            {Array.isArray(message.attachments) && message.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {message.attachments.map((attachment) => {
                  const isImage = attachment.mimeType?.startsWith('image/');
                  const mediaSource = attachment.content || attachment.path;

                  return (
                    <div key={attachment.id} className="attachment-preview max-w-xs">
                      {isImage && mediaSource ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({ src: mediaSource, alt: attachment.name })
                          }
                          className="group/img relative cursor-zoom-in"
                        >
                          <img
                            src={mediaSource}
                            alt={attachment.name}
                            className="rounded-lg max-h-48 object-contain transition-transform hover:scale-[1.02]"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 rounded-lg transition-colors" />
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">{attachment.name}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {}
            {enableActions && (
              <div
                className={cn(
                  'flex items-center gap-1 mt-2 transition-opacity',
                  showActions ? 'opacity-100' : 'opacity-0',
                )}
              >
                {}
                <button onClick={handleCopy} className="p-1 text-zinc-500 hover:text-zinc-300">
                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
                <button onClick={handleBookmark} className="p-1 text-zinc-500 hover:text-zinc-300">
                  {message.bookmarked ? (
                    <BookmarkCheck size={13} className="text-amber-400" />
                  ) : (
                    <Bookmark size={13} />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  if (isToolCall) {
    return (
      <div
        className="group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {showAvatar && (
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${avatarBg} text-white text-sm font-medium`}
          >
            AI
          </div>
        )}
        <div className="flex-1">{renderToolCard()}</div>
      </div>
    );
  }

  return (
    <>
      {/* Image Lightbox */}
      <ImageLightbox
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        src={lightboxImage?.src || ''}
        alt={lightboxImage?.alt}
      />

      {/* Context Menu Portal */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-zinc-700 bg-zinc-800/95 backdrop-blur-sm py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handleCopy();
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
          >
            <Copy size={14} />
            Copy message
          </button>
          <button
            onClick={() => {
              handleBookmark();
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
          >
            {message.bookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            {message.bookmarked ? 'Remove bookmark' : 'Bookmark'}
          </button>
          {isUser && onEdit && (
            <button
              onClick={() => {
                onEdit(message.content);
                closeContextMenu();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
            >
              <Edit2 size={14} />
              Edit message
            </button>
          )}
          {isAssistant && onRegenerate && !message.error && (
            <button
              onClick={() => {
                onRegenerate();
                closeContextMenu();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/50 transition-colors"
            >
              <RotateCw size={14} />
              Regenerate
            </button>
          )}
          {onDelete && (
            <>
              <div className="my-1 border-t border-zinc-700" />
              <button
                onClick={() => {
                  onDelete();
                  closeContextMenu();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      <div
        className={`message-bubble group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors ${
          isUser ? 'flex-row-reverse' : ''
        }`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        onContextMenu={handleContextMenu}
      >
        {showAvatar && !isUser && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-medium`}
          >
            {isSystem ? 'S' : 'AI'}
          </div>
        )}

        <div className={cn('min-w-0 relative', isUser ? 'max-w-[60%] ml-auto' : 'flex-1')}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isUser ? 'You' : isSystem ? 'System' : 'Assistant'}
            </span>
            {showTimestamp && <span className="message-meta text-zinc-500">{formattedTime}</span>}
            {/* Model badge for assistant messages */}
            {isAssistant && message.metadata?.model && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                {message.metadata.model
                  .split('/')
                  .pop()
                  ?.replace(/-/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase())
                  .slice(0, 20) || message.metadata.model}
              </span>
            )}
            {message.pending && (
              <span className="inline-flex items-center gap-1 message-meta text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                Sending...
              </span>
            )}
            {message.error && (
              <span className="inline-flex items-center gap-1 message-meta text-red-500">
                <span className="font-medium">Failed</span>
                <span className="text-zinc-500">- {message.error}</span>
              </span>
            )}
            {message.metadata?.streaming && !message.pending && (
              <span className="inline-flex items-center gap-1.5 message-meta text-purple-400">
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full bg-purple-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }}
                    />
                  ))}
                </span>
                <span className="text-xs">Generating</span>
              </span>
            )}
          </div>

          {}
          {message.metadata?.streaming && <StatusTrail messageId={message.id} />}

          <div
            className={`prose prose-sm dark:prose-invert max-w-none transition-opacity ${
              message.pending ? 'opacity-60' : 'opacity-100'
            } ${message.error ? 'text-red-500' : ''}`}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code(props) {
                    const { inline, className, children, ...rest } =
                      props as React.HTMLAttributes<HTMLElement> & { inline?: boolean };
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : 'text';
                    const code = String(children).replace(/\n$/, '');

                    return !inline ? (
                      <CodeBlock
                        code={code}
                        language={language || 'text'}
                        showLineNumbers={true}
                        enableCopy={true}
                      />
                    ) : (
                      <code
                        className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono"
                        {...rest}
                      >
                        {children}
                      </code>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      >
                        {children}
                      </a>
                    );
                  },

                  p({ children }) {
                    if (typeof children === 'string') {
                      return <p>{parseCitations(children)}</p>;
                    }
                    return <p>{children}</p>;
                  },

                  li({ children }) {
                    if (typeof children === 'string') {
                      return <li>{parseCitations(children)}</li>;
                    }
                    return <li>{children}</li>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {/* Streaming cursor */}
              {message.metadata?.streaming && (
                <span
                  className="inline-block w-2 h-4 ml-0.5 bg-purple-400 animate-pulse rounded-sm"
                  style={{ animationDuration: '0.5s' }}
                />
              )}
            </div>
          </div>

          {}
          {Array.isArray(message.attachments) && message.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {message.attachments.map((attachment) => {
                const isImage = attachment.mimeType?.startsWith('image/');
                const isVideo = attachment.mimeType?.startsWith('video/');
                const isAudio = attachment.mimeType?.startsWith('audio/');
                const mediaSource = attachment.content || attachment.path;

                return (
                  <div key={attachment.id} className="attachment-preview max-w-md">
                    {isImage && mediaSource ? (
                      <button
                        type="button"
                        onClick={() => setLightboxImage({ src: mediaSource, alt: attachment.name })}
                        className="group/img relative cursor-zoom-in"
                      >
                        <img
                          src={mediaSource}
                          alt={attachment.name}
                          className="rounded-lg max-h-64 object-contain transition-transform hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover/img:opacity-100 transition-opacity text-white text-xs bg-black/50 px-2 py-1 rounded-full">
                            Click to expand
                          </span>
                        </div>
                      </button>
                    ) : isVideo && mediaSource ? (
                      <video
                        src={mediaSource}
                        controls
                        className="rounded-lg max-h-64 w-full"
                        preload="metadata"
                      >
                        <track kind="captions" />
                        Your browser does not support video playback.
                      </video>
                    ) : isAudio && mediaSource ? (
                      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                        <audio src={mediaSource} controls className="w-full max-w-xs">
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                        <FileText className="h-5 w-5 text-zinc-500" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {attachment.name}
                          </div>
                          {attachment.size && (
                            <div className="text-xs text-zinc-500 message-meta">
                              {(attachment.size / 1024).toFixed(1)} KB
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Panels */}
          {message.inlinePanels && message.inlinePanels.length > 0 && (
            <div className="mt-4 space-y-3">
              {message.inlinePanels.map((panel) => (
                <InlinePanelRenderer
                  key={panel.id}
                  panel={panel}
                  messageId={message.id}
                  onToggleCollapse={() =>
                    useUnifiedChatStore.getState().toggleInlinePanelCollapse(message.id, panel.id)
                  }
                />
              ))}
            </div>
          )}

          {}
          {enableActions && (
            <div
              className={cn(
                'flex items-center justify-center gap-1 mt-2 transition-opacity',
                showActions ? 'opacity-100' : 'opacity-0',
              )}
            >
              <button
                onClick={handleCopy}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="Copy message"
              >
                {copied ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className="text-zinc-600 dark:text-zinc-400" />
                )}
              </button>
              <button
                onClick={handleBookmark}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title={message.bookmarked ? 'Remove bookmark' : 'Bookmark message'}
              >
                {message.bookmarked ? (
                  <BookmarkCheck size={14} className="text-amber-500" />
                ) : (
                  <Bookmark size={14} className="text-zinc-600 dark:text-zinc-400" />
                )}
              </button>

              {/* Reaction picker */}
              <div className="relative">
                <button
                  onClick={() => setShowReactionPicker(!showReactionPicker)}
                  className={cn(
                    'p-1.5 rounded transition-colors',
                    showReactionPicker
                      ? 'bg-zinc-200 dark:bg-zinc-700'
                      : 'hover:bg-zinc-200 dark:hover:bg-zinc-700',
                  )}
                  title="Add reaction"
                >
                  <SmilePlus size={14} className="text-zinc-600 dark:text-zinc-400" />
                </button>

                {/* Reaction picker dropdown */}
                {showReactionPicker && (
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex items-center gap-0.5 p-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-lg z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {REACTIONS.map((reaction) => (
                      <button
                        key={reaction.type}
                        onClick={() => handleReaction(reaction.type)}
                        className={cn(
                          'p-1.5 rounded-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700',
                          message.reactions?.includes(reaction.type) &&
                            'bg-primary/20 text-primary',
                        )}
                        title={reaction.label}
                      >
                        {reaction.icon}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Existing reactions display */}
              {message.reactions && message.reactions.length > 0 && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                  {REACTIONS.filter((r) => message.reactions?.includes(r.type)).map((reaction) => (
                    <button
                      key={reaction.type}
                      onClick={() => handleReaction(reaction.type)}
                      className="p-0.5 hover:scale-110 transition-transform"
                      title={`Remove ${reaction.label}`}
                    >
                      {reaction.icon}
                    </button>
                  ))}
                </div>
              )}

              {isAssistant && onRegenerate && !message.error && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                  title="Regenerate"
                >
                  <RotateCw size={14} className="text-zinc-600 dark:text-zinc-400" />
                </button>
              )}
              {message.error && onRegenerate && (
                <button
                  onClick={handleRetry}
                  className="p-1.5 hover:bg-red-200 dark:hover:bg-red-900/30 rounded transition-colors"
                  title="Retry sending"
                >
                  <RotateCw size={14} className="text-red-600 dark:text-red-400" />
                </button>
              )}
              {isUser && onEdit && !message.error && (
                <button
                  onClick={() => onEdit(message.content)}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                  title="Edit"
                >
                  <Edit2 size={14} className="text-zinc-600 dark:text-zinc-400" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} className="text-zinc-600 dark:text-zinc-400" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

MessageBubbleComponent.displayName = 'MessageBubble';

export const MessageBubble = memo(MessageBubbleComponent);
export default MessageBubble;
