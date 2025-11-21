import React, { useMemo, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Copy,
  RotateCw,
  Edit2,
  Trash2,
  MoreVertical,
  Loader2,
  CheckCircle2,
  Terminal as TerminalIcon,
  Globe2,
  FileText,
  Image,
} from 'lucide-react';
import { EnhancedMessage } from '../../stores/unifiedChatStore';
import { CodeBlock } from './Visualizations/CodeBlock';
import { emit } from '@tauri-apps/api/event';
import { isTauri } from '../../lib/tauri-mock';
import 'katex/dist/katex.min.css';

export interface MessageBubbleProps {
  message: EnhancedMessage;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onToggleSidecar?: (tab: 'files' | 'terminal' | 'browser' | 'code' | 'media') => void;
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

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  const avatarBg = useMemo(
    () => (isUser ? 'bg-blue-600' : isSystem ? 'bg-gray-600' : 'bg-purple-600'),
    [isUser, isSystem],
  );

  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [message.timestamp]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  }, [message.content, onCopy]);

  const thinkingMatch = useMemo(() => {
    const explicit = message.metadata?.type === 'reasoning';
    const regex = /<thinking>([\s\S]*?)<\/thinking>/i;
    const match = regex.exec(message.content);
    if (match) {
      return match[1]?.trim();
    }
    return explicit ? message.content : null;
  }, [message]);

  const isToolCall = useMemo(() => {
    const meta = message.metadata as any;
    return !!(meta?.tool || meta?.tool_call || meta?.event === 'tool');
  }, [message.metadata]);

  const toolName =
    (message.metadata as any)?.tool ||
    (message.metadata as any)?.tool_call ||
    (message.metadata as any)?.name;
  const toolStatus =
    (message.metadata as any)?.status ||
    (message.metadata as any)?.state ||
    (message.metadata as any)?.stage;
  const toolCommand = (message.metadata as any)?.command || message.content;
  const requiresApproval = Boolean((message.metadata as any)?.requiresApproval);
  const actionId =
    (message.metadata as any)?.actionId ||
    (message.metadata as any)?.action_id ||
    (message.metadata as any)?.id;
  const [approvalState, setApprovalState] = React.useState<
    'idle' | 'approving' | 'denying' | 'approved' | 'denied'
  >('idle');

  const renderToolCard = () => {
    const statusIcon =
      toolStatus === 'success' || toolStatus === 'completed' || approvalState === 'approved' ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      );

    const lowerTool = (toolName || '').toString().toLowerCase();
    const targetTab: 'terminal' | 'browser' | 'files' | 'code' | 'media' = lowerTool.includes(
      'browser',
    )
      ? 'browser'
      : lowerTool.includes('file') || lowerTool.includes('read') || lowerTool.includes('edit')
        ? 'files'
        : lowerTool.includes('image') || lowerTool.includes('video') || lowerTool.includes('media')
          ? 'media'
          : lowerTool.includes('code')
            ? 'code'
            : 'terminal';

    const icon =
      targetTab === 'browser' ? (
        <Globe2 className="h-4 w-4" />
      ) : targetTab === 'files' ? (
        <FileText className="h-4 w-4" />
      ) : targetTab === 'media' ? (
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
      : 'rounded-2xl border border-zinc-700 bg-black/60 px-4 py-3 shadow-lg shadow-black/30';

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
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
              {statusIcon}
              <span className="capitalize">{statusLabel}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleSidecar?.(targetTab)}
              className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-100 hover:border-zinc-500"
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

  if (thinkingMatch) {
    const firstLine = thinkingMatch
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim();
    const summary =
      (message.metadata as any)?.thinkingSummary ||
      (message.metadata as any)?.summary ||
      firstLine ||
      'Planning task...';

    return (
      <div
        className="group flex gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {showAvatar && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-700 text-white text-sm font-medium">
            AI
          </div>
        )}
        <div className="flex-1">
          <details className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
              <span className="font-semibold text-zinc-200">{summary}</span>
            </summary>
            <pre className="max-h-96 overflow-auto bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200">
              {thinkingMatch}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  if (isToolCall) {
    return (
      <div
        className="group flex gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
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
    <div
      className={`message-bubble group flex gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${
        isUser ? 'flex-row-reverse' : ''
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {showAvatar && (
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-medium`}
        >
          {isUser ? 'U' : isSystem ? 'S' : 'AI'}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {isUser ? 'You' : isSystem ? 'System' : 'Assistant'}
          </span>
          {showTimestamp && <span className="text-xs text-gray-500">{formattedTime}</span>}
          {message.metadata?.streaming && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <span className="animate-pulse">...</span>
              Streaming...
            </span>
          )}
          {message.metadata?.tokenCount && (
            <span className="text-xs text-gray-400">{message.metadata.tokenCount} tokens</span>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0b0c14] px-4 py-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {message.metadata?.model && <span>Model: {message.metadata.model}</span>}
            {message.metadata?.provider && <span>Provider: {message.metadata.provider}</span>}
            {message.metadata?.tokenCount && <span>{message.metadata.tokenCount} tokens</span>}
            {message.metadata?.cost && <span>${message.metadata.cost.toFixed(4)}</span>}
          </div>
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
                      className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono"
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
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {Array.isArray(message.attachments) && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
              >
                <span className="text-gray-600 dark:text-gray-400">{attachment.name}</span>
                {attachment.size && (
                  <span className="text-xs text-gray-500">
                    ({Math.round(attachment.size / 1024)} KB)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {message.metadata && (
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            {message.metadata.model && <span>Model: {message.metadata.model}</span>}
            {message.metadata.duration && (
              <span>{(message.metadata.duration / 1000).toFixed(2)}s</span>
            )}
            {message.metadata.cost && <span>${message.metadata.cost.toFixed(4)}</span>}
          </div>
        )}
      </div>

      {enableActions && (
        <div
          className={`flex-shrink-0 flex items-start gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}
        >
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copy message"
          >
            <Copy size={14} className="text-gray-600 dark:text-gray-400" />
          </button>
          {isAssistant && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Regenerate"
            >
              <RotateCw size={14} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
          {isUser && onEdit && (
            <button
              onClick={() => onEdit(message.content)}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Edit"
            >
              <Edit2 size={14} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Delete"
            >
              <Trash2 size={14} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
          <button
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="More actions"
          >
            <MoreVertical size={14} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
};

MessageBubbleComponent.displayName = 'MessageBubble';

export const MessageBubble = memo(MessageBubbleComponent);
export default MessageBubble;
