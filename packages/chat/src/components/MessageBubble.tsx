import { useState } from 'react';
import { Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { ActionBar } from './ActionBar';
import { ThinkingBlock } from './ThinkingBlock';
import { WebSearchCard } from './WebSearchCard';
import { CitationPill } from './CitationPill';
import type { ChatMessage, Artifact } from '../lib/types';

interface MessageBubbleProps {
  message: ChatMessage;
  isLast: boolean;
  onRetry?: (messageId: string) => void;
  onArtifactClick?: (artifact: Artifact) => void;
}

// Format a timestamp string to "h:mm AM/PM"
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed silently
    }
  }

  return (
    <div className="relative my-3 rounded-[var(--chat-radius-lg)] bg-[var(--chat-surface-overlay)] overflow-hidden">
      {language && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-[var(--chat-border)]">
          <span className="text-[11px] font-medium text-[var(--chat-text-muted)] uppercase tracking-wide">
            {language}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={copied ? 'Copied' : 'Copy code'}
            onClick={handleCopy}
            className={cn(
              'h-6 w-6 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              copied && 'text-[var(--chat-accent-secondary)]',
            )}
          >
            <Copy size={12} />
          </Button>
        </div>
      )}
      {!language && (
        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={copied ? 'Copied' : 'Copy code'}
            onClick={handleCopy}
            className={cn(
              'h-6 w-6 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              copied && 'text-[var(--chat-accent-secondary)]',
            )}
          >
            <Copy size={12} />
          </Button>
        </div>
      )}
      <pre className="overflow-x-auto px-4 py-3 text-sm font-mono text-[var(--chat-text-primary)] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Lightweight markdown renderer — handles code blocks, tables, headers, lists,
// blockquotes, bold, italic, inline code, links, and strikethrough.
function renderContent(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on fenced code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  parts.forEach((part, i) => {
    if (part.startsWith('```')) {
      // Extract language and body
      const lines = part.slice(3).split('\n');
      const lang = lines[0]?.trim() || undefined;
      const body = lines
        .slice(1, lines[lines.length - 1]?.trim() === '```' ? -1 : undefined)
        .join('\n');
      nodes.push(<CodeBlock key={i} code={body} language={lang} />);
    } else {
      // Render plain-text segment line by line to preserve whitespace
      // Detect table rows (lines starting with |)
      const lines = part.split('\n');
      let tableBuffer: string[] = [];
      let listBuffer: { ordered: boolean; items: string[] } | null = null;

      const flushTable = (keyPrefix: string | number) => {
        if (tableBuffer.length === 0) return;
        const rows = tableBuffer.filter((l) => l.trim() !== '' && !/^[|\s-]+$/.test(l));
        if (rows.length > 0) {
          const header = rows[0];
          const body = rows.slice(1);
          const cells = (row: string) =>
            row
              .split('|')
              .filter((_, ci) => ci > 0 && ci < row.split('|').length - 1)
              .map((c) => c.trim());

          nodes.push(
            <div key={`${keyPrefix}-table`} className="my-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    {cells(header ?? '').map((cell, ci) => (
                      <th
                        key={ci}
                        className="border border-[var(--chat-border)] px-3 py-1.5 text-left font-medium text-[var(--chat-text-primary)] bg-[var(--chat-surface-elevated)]"
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {cells(row).map((cell, ci) => (
                        <td
                          key={ci}
                          className="border border-[var(--chat-border)] px-3 py-1.5 text-[var(--chat-text-primary)]"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
          );
        }
        tableBuffer = [];
      };

      const flushList = (keyPrefix: string | number) => {
        if (!listBuffer) return;
        const Tag = listBuffer.ordered ? 'ol' : 'ul';
        const listClass = listBuffer.ordered
          ? 'list-decimal pl-6 my-2 space-y-1 text-[15px] text-[var(--chat-text-primary)]'
          : 'list-disc pl-6 my-2 space-y-1 text-[15px] text-[var(--chat-text-primary)]';
        nodes.push(
          <Tag key={`${keyPrefix}-list`} className={listClass}>
            {listBuffer.items.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {renderInline(item)}
              </li>
            ))}
          </Tag>,
        );
        listBuffer = null;
      };

      lines.forEach((line, li) => {
        // Ordered list item: "1. text" or "1) text"
        // Use {0,10} instead of * to prevent ReDoS on whitespace-heavy input
        const orderedMatch = /^\s{0,10}\d+[.)]\s(.+)$/.exec(line);
        // Unordered list item: "- text" or "* text" (but not ** which is bold)
        const unorderedMatch = /^\s{0,10}[-*]\s(.+)$/.exec(line);
        // Avoid matching "* text *" patterns as list items when they look like emphasis
        const isUnorderedList =
          unorderedMatch && !(line.trim().startsWith('*') && !line.trim().startsWith('* '));

        if (line.startsWith('|')) {
          flushList(`${i}-${li}`);
          tableBuffer.push(line);
        } else if (orderedMatch) {
          flushTable(`${i}-${li}`);
          if (listBuffer && listBuffer.ordered) {
            listBuffer.items.push(orderedMatch[1] ?? '');
          } else {
            flushList(`${i}-${li}`);
            listBuffer = { ordered: true, items: [orderedMatch[1] ?? ''] };
          }
        } else if (isUnorderedList && unorderedMatch) {
          flushTable(`${i}-${li}`);
          if (listBuffer && !listBuffer.ordered) {
            listBuffer.items.push(unorderedMatch[1] ?? '');
          } else {
            flushList(`${i}-${li}`);
            listBuffer = { ordered: false, items: [unorderedMatch[1] ?? ''] };
          }
        } else {
          flushTable(`${i}-${li}`);
          flushList(`${i}-${li}`);

          if (line === '') {
            nodes.push(<span key={`${i}-${li}-br`} className="block h-3" />);
          } else if (/^#{1,6}\s/.test(line)) {
            // Headers
            const hashMatch = /^(#{1,6})\s(.+)$/.exec(line);
            if (hashMatch) {
              const level = hashMatch[1]!.length;
              const text = hashMatch[2] ?? '';
              const headerClasses: Record<number, string> = {
                1: 'text-2xl font-bold mt-4 mb-2',
                2: 'text-xl font-semibold mt-3 mb-2',
                3: 'text-lg font-semibold mt-3 mb-1',
                4: 'text-base font-semibold mt-2 mb-1',
                5: 'text-sm font-semibold mt-2 mb-1',
                6: 'text-sm font-medium mt-2 mb-1',
              };
              nodes.push(
                <div
                  key={`${i}-${li}`}
                  className={cn(
                    headerClasses[level],
                    'text-[var(--chat-text-primary)] leading-tight',
                  )}
                >
                  {renderInline(text)}
                </div>,
              );
            }
          } else if (line.startsWith('> ')) {
            // Blockquote
            const quoteText = line.slice(2);
            nodes.push(
              <blockquote
                key={`${i}-${li}`}
                className="border-l-3 border-[var(--chat-text-muted)] pl-3 my-2 text-[15px] text-[var(--chat-text-secondary)] italic leading-relaxed"
              >
                {renderInline(quoteText)}
              </blockquote>,
            );
          } else {
            nodes.push(
              <p
                key={`${i}-${li}`}
                className="leading-relaxed text-[15px] text-[var(--chat-text-primary)]"
              >
                {renderInline(line)}
              </p>,
            );
          }
        }
      });
      flushTable(`${i}-end`);
      flushList(`${i}-end`);
    }
  });

  return nodes;
}

// Inline rendering: bold, italic, inline code, links, strikethrough
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Handle [text](url), ~~strikethrough~~, **bold**, *italic*, `code`
  // Use [^~], [^*], [^`] negated classes instead of .+?/.* to prevent ReDoS
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|~~[^~]+~~|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('[') && match[2] && match[3]) {
      // Link: [text](url)
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--chat-accent-primary)] underline underline-offset-2 hover:opacity-80"
        >
          {match[2]}
        </a>,
      );
    } else if (token.startsWith('~~')) {
      parts.push(
        <del key={match.index} className="text-[var(--chat-text-muted)]">
          {token.slice(2, -2)}
        </del>,
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-[var(--chat-surface-overlay)] px-1 py-0.5 font-mono text-[13px] text-[var(--chat-text-primary)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 1 ? parts[0] : parts;
}

export function MessageBubble({
  message,
  isLast,
  onRetry,
  onArtifactClick: _onArtifactClick,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = Boolean(message.isStreaming);

  if (isUser) {
    return (
      <div className="message-enter flex flex-col items-end gap-1">
        <div
          className={cn(
            'max-w-[80%] rounded-2xl bg-[var(--chat-user-bubble-bg)] px-4 py-3',
            'text-[15px] leading-relaxed text-[var(--chat-text-primary)]',
            'whitespace-pre-wrap break-words',
          )}
        >
          {message.content}
        </div>
        <span className="text-[12px] text-[var(--chat-text-muted)] pr-1">
          {message.createdAt ? formatTime(message.createdAt) : ''}
        </span>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="message-enter flex flex-col gap-1">
      {/* Thinking block — rendered above text content */}
      {message.thinkingBlock && <ThinkingBlock block={message.thinkingBlock} />}

      {/* Web search results — rendered above text content */}
      {message.webSearchResults?.map((search) => (
        <WebSearchCard key={search.id} search={search} />
      ))}

      <div className="text-[15px] leading-relaxed text-[var(--chat-text-primary)] break-words">
        {renderContent(message.content)}
        {isStreaming && (
          <span
            aria-hidden
            className="inline-block w-0.5 h-4 bg-[var(--chat-text-primary)] ml-0.5 align-middle animate-pulse"
          />
        )}
      </div>

      {/* Citations — rendered below text content */}
      {message.citations && message.citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {message.citations.map((citation, idx) => (
            <CitationPill key={citation.id ?? idx} citation={citation} />
          ))}
        </div>
      )}

      {!isStreaming && isLast && (
        <ActionBar messageId={message.id} content={message.content} onRetry={onRetry} />
      )}
    </div>
  );
}
