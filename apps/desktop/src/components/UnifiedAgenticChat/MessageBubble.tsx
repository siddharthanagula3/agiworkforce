import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Copy, RotateCw, Edit2, Trash2, MoreVertical } from 'lucide-react';
import { EnhancedMessage } from '../../stores/unifiedChatStore';
import { CodeBlock } from './Visualizations/CodeBlock';
import { FileOperationCard } from './Cards/FileOperationCard';
import { TerminalCommandCard } from './Cards/TerminalCommandCard';
import { ToolExecutionCard } from './Cards/ToolExecutionCard';
import { ApprovalRequestCard } from './Cards/ApprovalRequestCard';
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
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  showAvatar = true,
  showTimestamp = true,
  enableActions = true,
  onRegenerate,
  onEdit,
  onDelete,
  onCopy,
}) => {
  const [showActions, setShowActions] = React.useState(false);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';

  const avatarBg = isUser ? 'bg-blue-600' : isSystem ? 'bg-gray-600' : 'bg-purple-600';

  const bubbleBg = isUser
    ? 'bg-blue-50 dark:bg-blue-900/20'
    : isSystem
      ? 'bg-gray-50 dark:bg-gray-800/50'
      : 'bg-white dark:bg-gray-800';

  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [message.timestamp]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      onCopy?.();
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  return (
    <div
      className={`message-bubble group flex gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${
        isUser ? 'flex-row-reverse' : ''
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {showAvatar && (
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-medium`}
        >
          {isUser ? 'U' : isSystem ? 'S' : 'AI'}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {isUser ? 'You' : isSystem ? 'System' : 'Assistant'}
          </span>
          {showTimestamp && <span className="text-xs text-gray-500">{formattedTime}</span>}
          {message.metadata?.streaming && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <span className="animate-pulse">●</span>
              Streaming...
            </span>
          )}
          {message.metadata?.tokenCount && (
            <span className="text-xs text-gray-400">{message.metadata.tokenCount} tokens</span>
          )}
        </div>

        {/* Message Content */}
        <div
          className={`rounded-lg px-4 py-3 ${bubbleBg} border border-gray-200 dark:border-gray-700`}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code(props) {
                  const { inline, className, children, ...rest } = props as any;
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

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
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

        {/* Operations (File, Terminal, Tool, Approval, Screenshot) */}
        {message.operations && message.operations.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.operations.map((operation) => {
              if (operation.type === 'file' && operation.data) {
                return (
                  <FileOperationCard
                    key={operation.data.id || operation.timestamp.toISOString()}
                    operation={operation.data}
                    showDiff={true}
                  />
                );
              }
              if (operation.type === 'terminal' && operation.data) {
                return (
                  <TerminalCommandCard
                    key={operation.data.id || operation.timestamp.toISOString()}
                    command={operation.data}
                    showOutput={true}
                  />
                );
              }
              if (operation.type === 'tool' && operation.data) {
                return (
                  <ToolExecutionCard
                    key={operation.data.id || operation.timestamp.toISOString()}
                    execution={operation.data}
                    showInputOutput={true}
                  />
                );
              }
              if (operation.type === 'approval' && operation.data) {
                return (
                  <ApprovalRequestCard
                    key={operation.data.id || operation.timestamp.toISOString()}
                    approval={operation.data}
                  />
                );
              }
              return null;
            })}
          </div>
        )}

        {/* Metadata Footer */}
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

      {/* Action Menu */}
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

export default MessageBubble;
