/**
 * MessageWithTools Component
 *
 * Enhanced message component that displays tool calls, results, and multi-step workflows.
 * This is an example showing how to integrate tool calling UI into chat messages.
 *
 * To use this, replace the Message component in ChatInterface with this one,
 * or add the tool calling sections to your existing Message component.
 */

import { useEffect, useMemo, useState, memo } from 'react';
import {
  User,
  Bot,
  Copy,
  Check,
  MoreVertical,
  RefreshCcw,
  Loader2,
  Pencil,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import 'katex/dist/katex.min.css';
import { Textarea } from '../ui/Textarea';
import { useConfirm } from '../ui/ConfirmDialog'; // Updated Nov 16, 2025

// Import tool calling components
import { ToolCallCard, ToolResultCard, ToolExecutionTimeline } from '../ToolCalling';
import type { MessageUI } from '../../types/chat';

export interface MessageWithToolsProps {
  message: MessageUI;
  onRegenerate?: (message: MessageUI) => Promise<void> | void;
  onEdit?: (message: MessageUI, content: string) => Promise<void> | void;
  onDelete?: (message: MessageUI) => Promise<void> | void;
  onCancelTool?: (toolCallId: string) => void;
  onApproveTool?: (toolCallId: string) => void;
  onRejectTool?: (toolCallId: string) => void;
  onRetryTool?: (toolCallId: string) => void;
}

type CodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};

function MarkdownCodeBlock({ inline, className, children, ...props }: CodeProps) {
  const [copied, setCopied] = useState(false);
  const rawCode = String(children ?? '').replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const language = match?.[1] ?? 'plaintext';

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code">
      <Button
        variant="outline"
        size="sm"
        className="absolute right-3 top-3 z-10 flex items-center gap-1 bg-background/90 backdrop-blur-sm text-xs opacity-0 transition-opacity group-hover/code:opacity-100"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span>{copied ? 'Copied!' : 'Copy code'}</span>
      </Button>
      <SyntaxHighlighter
        style={oneDark as SyntaxHighlighterProps['style']}
        language={language}
        PreTag="div"
        wrapLongLines
        showLineNumbers
        customStyle={{
          margin: 0,
          borderRadius: '0.75rem',
          paddingTop: '1.75rem',
        }}
      >
        {rawCode}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageWithToolsComponent({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  onCancelTool,
  onApproveTool,
  onRejectTool,
  onRetryTool,
}: MessageWithToolsProps) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isStreaming = Boolean(message.streaming);
  const canEdit = Boolean(onEdit) && message.role === 'user';
  const canDelete = Boolean(onDelete);
  const { confirm, dialog: confirmDialog } = useConfirm(); // Updated Nov 16, 2025

  // Check if message has tool-related content
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasToolResults = message.tool_results && message.tool_results.length > 0;
  const hasWorkflow = Boolean(message.workflow);
  const hasAnyTools = hasToolCalls || hasToolResults || hasWorkflow;

  useEffect(() => {
    if (!isEditing) {
      setEditValue(message.content);
    }
  }, [isEditing, message.content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) {
      return;
    }
    setRegenerating(true);
    try {
      await onRegenerate(message);
    } finally {
      setRegenerating(false);
    }
  };

  const handleStartEdit = () => {
    setEditValue(message.content);
    setActionError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(message.content);
    setActionError(null);
  };

  const handleSaveEdit = async () => {
    if (!onEdit) {
      return;
    }

    const trimmed = editValue.trim();
    if (!trimmed) {
      setActionError('Message cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    setActionError(null);
    try {
      await onEdit(message, trimmed);
      setIsEditing(false);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : 'Failed to save changes';
      setActionError(fallback);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Updated Nov 16, 2025 - Use accessible confirm dialog
  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete message?',
      description: 'Are you sure you want to delete this message? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);
    try {
      await onDelete(message);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : 'Failed to delete message';
      setActionError(fallback);
    } finally {
      setIsDeleting(false);
    }
  };

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  const avatar = useMemo(() => {
    if (isUser) {
      return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
      );
    }
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Bot className="h-4 w-4" />
      </div>
    );
  }, [isUser]);

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="px-4 py-1 text-xs text-muted-foreground rounded-full bg-muted/50">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <>
      {confirmDialog}
      <div
        className={cn(
          'group relative flex gap-3 px-4 py-4 transition-colors',
          'hover:bg-accent/50',
          isUser && 'bg-muted/30',
        )}
      >
        {avatar}

        <div className="flex-1 space-y-3 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{isUser ? 'You' : 'Assistant'}</span>
            <span className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {hasAnyTools && !isUser && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wrench className="h-3 w-3" />
                <span>Tool Execution</span>
              </div>
            )}
          </div>

          {/* Message Content */}
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                disabled={isSavingEdit}
                rows={Math.min(Math.max(editValue.split('\n').length + 1, 3), 10)}
                className="resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void handleSaveEdit()} disabled={isSavingEdit}>
                  {isSavingEdit && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {message.content && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code: (props) => <MarkdownCodeBlock {...props} />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Tool Execution Workflow (Multi-step) */}
              {hasWorkflow && message.workflow && (
                <div className="mt-3">
                  <ToolExecutionTimeline
                    workflow={message.workflow}
                    onCancelTool={onCancelTool}
                    onApproveTool={onApproveTool}
                    onRejectTool={onRejectTool}
                    onRetryTool={onRetryTool}
                  />
                </div>
              )}

              {/* Individual Tool Calls (when not part of workflow) */}
              {!hasWorkflow && hasToolCalls && (
                <div className="space-y-2 mt-3">
                  {message.tool_calls!.map((toolCall) => (
                    <ToolCallCard
                      key={toolCall.id}
                      toolCall={toolCall}
                      onCancel={onCancelTool}
                      onApprove={onApproveTool}
                      onReject={onRejectTool}
                    />
                  ))}
                </div>
              )}

              {/* Individual Tool Results (when not part of workflow) */}
              {!hasWorkflow && hasToolResults && (
                <div className="space-y-2 mt-3">
                  {message.tool_results!.map((result) => (
                    <ToolResultCard key={result.tool_call_id} result={result} />
                  ))}
                </div>
              )}
            </>
          )}

          {actionError && <p className="text-xs font-medium text-destructive">{actionError}</p>}

          {(message.tokens || message.cost) && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              {message.tokens && <span>{message.tokens} tokens</span>}
              {message.cost && <span>${message.cost.toFixed(4)}</span>}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    void handleCopy();
                  }}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="ml-2">{copied ? 'Copied!' : 'Copy message'}</span>
                </DropdownMenuItem>
                {isAssistant && (
                  <DropdownMenuItem
                    disabled={regenerating || isStreaming || isDeleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleRegenerate();
                    }}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    <span className="ml-2">
                      {regenerating ? 'Regenerating...' : 'Regenerate response'}
                    </span>
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem
                    disabled={isSavingEdit || isDeleting || isStreaming}
                    onClick={(event) => {
                      event.preventDefault();
                      handleStartEdit();
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="ml-2">Edit message</span>
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    disabled={isDeleting}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={(event) => {
                      event.preventDefault();
                      void handleDelete();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-2">Delete message</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </>
  );
}

// Export memoized component to prevent unnecessary re-renders
export const MessageWithTools = memo(MessageWithToolsComponent, (prevProps, nextProps) => {
  // Re-render if message content, tool calls, or handlers change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.streaming === nextProps.message.streaming &&
    prevProps.message.tokens === nextProps.message.tokens &&
    prevProps.message.cost === nextProps.message.cost &&
    prevProps.message.tool_calls === nextProps.message.tool_calls &&
    prevProps.message.tool_results === nextProps.message.tool_results &&
    prevProps.message.workflow === nextProps.message.workflow &&
    prevProps.onRegenerate === nextProps.onRegenerate &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onCancelTool === nextProps.onCancelTool &&
    prevProps.onApproveTool === nextProps.onApproveTool &&
    prevProps.onRejectTool === nextProps.onRejectTool &&
    prevProps.onRetryTool === nextProps.onRetryTool
  );
});

MessageWithTools.displayName = 'MessageWithTools';
