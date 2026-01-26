'use client';

import React, { useState, useCallback, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { User, Sparkles, Copy, Check, ThumbsUp, ThumbsDown, RefreshCw, Edit2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { Message } from '@/stores/chatStore';
import { CodeBlock } from './CodeBlock';

interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onReaction?: (type: 'thumbsUp' | 'thumbsDown') => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showAvatar = true,
  showTimestamp = false,
  enableActions = true,
  onRegenerate,
  onEdit,
  onReaction,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [message.content]);

  const formattedTime = useMemo(() => {
    if (!showTimestamp || !message.createdAt) return null;
    const date = new Date(message.createdAt);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, [message.createdAt, showTimestamp]);

  return (
    <div
      data-message-role={message.role}
      data-testid={`message-${message.role}`}
      className={clsx(
        'group flex gap-3 px-4 py-3 transition-colors message-bubble',
        isUser ? 'flex-row-reverse' : '',
        !isUser && 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar */}
      {showAvatar && (
        <div
          className={clsx(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-amber-500 to-orange-600',
          )}
        >
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Sparkles className="w-4 h-4 text-white" />
          )}
        </div>
      )}

      {/* Content */}
      <div className={clsx('flex-1 min-w-0', isUser ? 'flex flex-col items-end' : '')}>
        {/* Role label and timestamp */}
        <div className={clsx('flex items-center gap-2 mb-1', isUser && 'flex-row-reverse')}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {isUser ? 'You' : 'AI'}
          </span>
          {formattedTime && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{formattedTime}</span>
          )}
          {message.model && !isUser && (
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              {message.model}
            </span>
          )}
        </div>

        {/* Message bubble */}
        <div
          className={clsx(
            'rounded-2xl px-4 py-2.5 max-w-[85%]',
            isUser
              ? 'bg-blue-500 text-white rounded-br-md'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md',
          )}
        >
          {isStreaming && !message.content ? (
            <div className="flex items-center gap-2">
              <span className="animate-pulse">Thinking</span>
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
              </span>
            </div>
          ) : isUser ? (
            // User messages: plain text, no markdown
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.content}
            </p>
          ) : (
            // Assistant messages: render markdown
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4 prose-li:my-0.5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  // Custom code block rendering
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !className;

                    if (isInline) {
                      return (
                        <code
                          className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }

                    return (
                      <CodeBlock
                        language={match?.[1] || 'text'}
                        code={String(children).replace(/\n$/, '')}
                      />
                    );
                  },
                  // Custom link rendering
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 dark:text-blue-400 hover:underline"
                      >
                        {children}
                      </a>
                    );
                  },
                  // Custom pre handling
                  pre({ children }) {
                    return <div className="not-prose my-2">{children}</div>;
                  },
                  // Custom table styling
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-left font-semibold">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2">
                        {children}
                      </td>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Streaming indicator */}
          {isStreaming && message.content && (
            <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5" />
          )}
        </div>

        {/* Actions */}
        {enableActions && !isUser && !isStreaming && (
          <div
            className={clsx(
              'flex items-center gap-1 mt-1 transition-opacity duration-200',
              isHovered ? 'opacity-100' : 'opacity-0',
            )}
          >
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              )}
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Regenerate response"
              >
                <RefreshCw className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            )}

            {onReaction && (
              <>
                <button
                  onClick={() => onReaction('thumbsUp')}
                  className={clsx(
                    'p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                    message.reactions?.some((r) => r.type === 'thumbsUp')
                      ? 'text-green-500'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                  )}
                  title="Good response"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onReaction('thumbsDown')}
                  className={clsx(
                    'p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                    message.reactions?.some((r) => r.type === 'thumbsDown')
                      ? 'text-red-500'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                  )}
                  title="Poor response"
                >
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}

        {/* User message actions */}
        {enableActions && isUser && (
          <div
            className={clsx(
              'flex items-center gap-1 mt-1 transition-opacity duration-200',
              isHovered ? 'opacity-100' : 'opacity-0',
            )}
          >
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              )}
            </button>

            {onEdit && (
              <button
                onClick={() => onEdit(message.content)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Edit message"
              >
                <Edit2 className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            )}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((attachment) => (
              <div key={attachment.id} className="relative">
                {attachment.type === 'image' && attachment.content && (
                  <img
                    src={attachment.content}
                    alt={attachment.name}
                    className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                  />
                )}
                {attachment.type === 'file' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[150px]">
                      {attachment.name}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
