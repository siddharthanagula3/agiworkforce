'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, User, Bot, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ChatMessage } from '../../stores/chat-store';
import type { Components } from 'react-markdown';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
}

// ---------------------------------------------------------------------------
// Code block with copy
// ---------------------------------------------------------------------------

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  if (!match) {
    return (
      <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[13px] text-foreground">
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl border border-border/40">
      <div className="flex items-center justify-between bg-muted/30 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 transition-all hover:bg-muted/60 hover:text-foreground group-hover/code:opacity-100"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#0d0d0d] p-4 text-[13px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown rendering config
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
  code: CodeBlock as Components['code'],
  h1: ({ children }) => <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-[1.7]">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border/40 bg-muted/30 px-3 py-2 text-left text-xs font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-border/20 px-3 py-2 text-sm">{children}</td>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/30 pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-border/30" />,
};

// ---------------------------------------------------------------------------
// Single message
// ---------------------------------------------------------------------------

function MessageItem({
  message,
  onRegenerate,
  onDelete,
}: {
  message: ChatMessage;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isUser = message.role === 'user';
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    }
    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActions]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('group px-4 py-5', !isUser && 'hover:bg-muted/5')}>
      <div className={cn('mx-auto flex max-w-3xl gap-4', isUser && 'flex-row-reverse')}>
        {/* Avatar */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isUser
              ? 'bg-gradient-to-br from-violet-500/80 to-purple-600/80'
              : 'bg-gradient-to-br from-teal-500/80 to-emerald-600/80',
          )}
        >
          {isUser ? (
            <User className="h-4 w-4 text-white" />
          ) : (
            <Bot className="h-4 w-4 text-white" />
          )}
        </div>

        {/* Content */}
        <div className={cn('min-w-0 flex-1', isUser && 'text-right')}>
          {/* Name + time */}
          <div
            className={cn('mb-1.5 flex items-center gap-2 text-sm', isUser && 'flex-row-reverse')}
          >
            <span className="font-medium text-foreground">{isUser ? 'You' : 'AI'}</span>
            <span className="text-[11px] text-muted-foreground/60">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Message body */}
          <div
            className={cn(
              'prose prose-sm dark:prose-invert max-w-none text-[15px]',
              isUser && 'prose-p:text-right',
            )}
          >
            {message.isStreaming && !message.content.trim() ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-sm">Thinking...</span>
              </div>
            ) : (
              <>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && message.content.trim() && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
                )}
              </>
            )}
          </div>

          {/* Actions (hover) */}
          {!message.isStreaming && (
            <div
              className={cn(
                'mt-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                isUser && 'flex-row-reverse',
              )}
            >
              <button
                onClick={handleCopy}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>

              {!isUser && (
                <div className="relative" ref={actionsRef}>
                  <button
                    onClick={() => setShowActions(!showActions)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  {showActions && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[140px] rounded-lg border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
                      {onRegenerate && (
                        <button
                          onClick={() => {
                            onRegenerate(message.id);
                            setShowActions(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs hover:bg-muted/60"
                        >
                          <RefreshCw className="h-3 w-3" /> Regenerate
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => {
                            onDelete(message.id);
                            setShowActions(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="px-4 py-5">
      <div className="mx-auto flex max-w-3xl gap-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/80 to-emerald-600/80">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="flex items-center gap-1 pt-2">
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message List
// ---------------------------------------------------------------------------

export function MessageListNew({ messages, isLoading, onRegenerate, onDelete }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1" />
      <div>
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onRegenerate={onRegenerate}
            onDelete={onDelete}
          />
        ))}
        {isLoading && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
          <TypingIndicator />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
