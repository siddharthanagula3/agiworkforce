'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Copy,
  Check,
  User,
  Bot,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  FileCode,
  Plus,
  Minus,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ChatMessage } from '../../stores/chat-store';
import type { Components } from 'react-markdown';
import { ReasoningAccordion } from './ReasoningAccordion';
import { ToolTimeline } from './ToolTimeline';
import { SearchingIndicator, CompactSearchResults } from '../search/SearchResults';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
}

// ---------------------------------------------------------------------------
// Code block with syntax highlighting (matches desktop CodeBlock)
// ---------------------------------------------------------------------------

function detectDiff(code: string): boolean {
  const lines = code.split('\n');
  let markers = 0;
  for (const line of lines) {
    if (
      line.startsWith('@@') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('+') ||
      line.startsWith('-')
    )
      markers++;
  }
  return lines.length > 0 && markers / lines.length > 0.2;
}

function getDiffStats(code: string) {
  let additions = 0,
    deletions = 0;
  for (const line of code.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');
  const lineCount = codeString.split('\n').length;
  const shouldCollapse = lineCount > 10;
  const isDiff = language === 'diff' || detectDiff(codeString);
  const diffStats = isDiff ? getDiffStats(codeString) : null;

  if (!match) {
    return (
      <code className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[13px] font-mono text-zinc-200">
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
    <div className="group/code relative my-3 overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700/50 bg-zinc-800/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <FileCode className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[11px] font-medium text-zinc-400">
            {isDiff ? 'diff' : language}
          </span>
          {isDiff && diffStats && (
            <div className="flex items-center gap-2 ml-1">
              {diffStats.additions > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-emerald-400">
                  <Plus className="h-3 w-3" />
                  {diffStats.additions}
                </span>
              )}
              {diffStats.deletions > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-red-400">
                  <Minus className="h-3 w-3" />
                  {diffStats.deletions}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {shouldCollapse && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200 transition-colors"
            >
              {collapsed ? `Show all (${lineCount} lines)` : 'Collapse'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-400 opacity-0 transition-all hover:bg-zinc-700/60 hover:text-zinc-200 group-hover/code:opacity-100"
            aria-label={copied ? 'Copied' : 'Copy'}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'relative overflow-hidden transition-[max-height] duration-300',
          shouldCollapse && collapsed && 'max-h-[200px]',
        )}
      >
        {isDiff ? (
          <div className="overflow-x-auto p-4 font-mono text-[13px] leading-[1.6]">
            {codeString.split('\n').map((line, idx) => {
              let bg = 'transparent',
                color = 'text-zinc-300';
              if (line.startsWith('+++') || line.startsWith('---')) {
                bg = 'rgba(59,130,246,0.1)';
                color = 'text-blue-400';
              } else if (line.startsWith('@@')) {
                bg = 'rgba(139,92,246,0.1)';
                color = 'text-purple-400';
              } else if (line.startsWith('+')) {
                bg = 'rgba(34,197,94,0.15)';
                color = 'text-emerald-300';
              } else if (line.startsWith('-')) {
                bg = 'rgba(239,68,68,0.15)';
                color = 'text-red-300';
              }
              return (
                <div key={idx} className={cn('flex', color)} style={{ backgroundColor: bg }}>
                  <span className="min-w-[2.5em] select-none pr-4 text-right text-zinc-600">
                    {idx + 1}
                  </span>
                  <span className="flex-1 whitespace-pre">{line}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: 'transparent',
              fontSize: '13px',
              lineHeight: '1.6',
            }}
            showLineNumbers={lineCount > 3}
            lineNumberStyle={{
              minWidth: '2.5em',
              paddingRight: '1em',
              color: '#4b5563',
              userSelect: 'none',
            }}
          >
            {codeString}
          </SyntaxHighlighter>
        )}

        {/* Expand button when collapsed */}
        {shouldCollapse && collapsed && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-transparent pt-8 pb-2 text-center">
            <button
              onClick={() => setCollapsed(false)}
              className="rounded-full bg-zinc-700/80 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors"
            >
              Show {lineCount} lines
            </button>
          </div>
        )}
      </div>
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

const MessageItemComponent = ({
  message,
  onRegenerate,
  onDelete,
}: {
  message: ChatMessage;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isUser = message.role === 'user';
  const actionsRef = useRef<HTMLDivElement>(null);

  const hasThinkingSteps =
    message.metadata?.thinkingSteps && message.metadata.thinkingSteps.length > 0;

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
    return undefined;
  }, [showActions]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('group message-bubble px-4 py-5', !isUser && 'hover:bg-muted/5')}>
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
          {/* Name + time + model badge */}
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
            {!isUser && message.metadata?.model && (
              <span className="opacity-0 transition-opacity group-hover:opacity-100 inline-flex items-center rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {message.metadata.model}
              </span>
            )}
          </div>

          {/* Reasoning accordion — shown before message content */}
          {!isUser && hasThinkingSteps && (
            <div className="mb-3">
              <ReasoningAccordion
                steps={message.metadata!.thinkingSteps!}
                isStreaming={message.isStreaming}
              />
            </div>
          )}

          {/* Web search indicator — shown while server-side search is running */}
          {!isUser && message.metadata?.isSearching && (
            <div className="mb-3">
              <SearchingIndicator />
            </div>
          )}

          {/* Web search results — shown after search completes */}
          {!isUser &&
            message.metadata?.searchResults &&
            message.metadata.searchResults.length > 0 && (
              <div className="mb-3">
                <CompactSearchResults
                  searchResponse={{
                    query: '',
                    results: message.metadata.searchResults,
                    timestamp: new Date(),
                  }}
                />
              </div>
            )}

          {/* User message bubble or assistant prose */}
          {isUser ? (
            <div className="inline-block rounded-2xl rounded-tr-sm bg-primary/10 px-4 py-3 text-[15px] text-foreground text-left">
              {message.content}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[15px]">
              {message.isStreaming && !message.content.trim() && !message.metadata?.isSearching ? (
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
                    <span className="ml-0.5 inline-block animate-pulse text-primary">▋</span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tool timeline — shown after content for assistant messages */}
          {!isUser &&
            message.metadata &&
            'tools' in message.metadata &&
            Array.isArray((message.metadata as Record<string, unknown>)['tools']) && (
              <div className="mt-3">
                <ToolTimeline
                  tools={
                    (message.metadata as Record<string, unknown>)['tools'] as Array<{
                      name: string;
                      status: 'running' | 'completed' | 'failed';
                      durationMs?: number;
                      args?: string;
                    }>
                  }
                />
              </div>
            )}

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
};

// Memoize MessageItem with custom comparison to prevent re-renders
const MessageItem = memo(MessageItemComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.role === next.message.role &&
    prev.message.isStreaming === next.message.isStreaming &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onDelete === next.onDelete
  );
});

MessageItem.displayName = 'MessageItem';

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

const MessageListNewComponent = ({
  messages,
  isLoading,
  onRegenerate,
  onDelete,
}: MessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Memoize computed values
  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);
  const lastIsStreaming = useMemo(() => lastMessage?.isStreaming ?? false, [lastMessage]);

  // Memoize callbacks to prevent child re-renders
  const handleRegenerate = useCallback((id: string) => onRegenerate?.(id), [onRegenerate]);

  const handleDelete = useCallback((id: string) => onDelete?.(id), [onDelete]);

  // Auto-scroll to bottom on new messages or while streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, lastIsStreaming]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1" />
      <div>
        <AnimatePresence initial={false}>
          {messages.map((message, messageIndex) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut', delay: messageIndex * 0.04 }}
            >
              <MessageItem
                message={message}
                onRegenerate={handleRegenerate}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
          <TypingIndicator />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

/**
 * MessageListNew with memoization optimization.
 *
 * - Callbacks memoized with useCallback
 * - MessageItem children memoized with React.memo
 * - Target: reduce render time from 150-200ms to <50ms
 */
export const MessageListNew = memo(MessageListNewComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.messages.length === next.messages.length &&
    prev.isLoading === next.isLoading &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onDelete === next.onDelete &&
    // Quick check of message IDs to detect changes
    prev.messages.every((m, i) => m.id === next.messages[i]?.id)
  );
});

MessageListNew.displayName = 'MessageListNew';
