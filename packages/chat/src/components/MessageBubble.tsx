import { useState } from 'react';
import { Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { ActionBar } from './ActionBar';
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

// Lightweight markdown renderer — handles code blocks, tables, bold, italic, inline code
// Full markdown library can replace this later
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

      lines.forEach((line, li) => {
        if (line.startsWith('|')) {
          tableBuffer.push(line);
        } else {
          flushTable(`${i}-${li}`);
          if (line === '') {
            nodes.push(<span key={`${i}-${li}-br`} className="block h-3" />);
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
    }
  });

  return nodes;
}

// Inline rendering: bold, italic, inline code
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Handle **bold**, *italic*, `code`
  const regex = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
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
      <div className="text-[15px] leading-relaxed text-[var(--chat-text-primary)] break-words">
        {renderContent(message.content)}
        {isStreaming && (
          <span
            aria-hidden
            className="inline-block w-0.5 h-4 bg-[var(--chat-text-primary)] ml-0.5 align-middle animate-pulse"
          />
        )}
      </div>

      {!isStreaming && isLast && (
        <ActionBar messageId={message.id} content={message.content} onRetry={onRetry} />
      )}
    </div>
  );
}
