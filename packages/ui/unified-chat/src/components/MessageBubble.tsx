import { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  Wrench,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '@agiworkforce/ui';
import { ActionBar } from './ActionBar';
import { ThinkingBlock } from './ThinkingBlock';
import { LegacyWebSearchCard } from './WebSearchCard';
import { CitationPill } from './CitationPill';
import { DownloadCard } from './DownloadCard';
import { MessageGeneratedFiles, hasRunningExecutionTool } from './MessageGeneratedFiles';
import { ToolCallCard } from './ToolCallCard';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { MessageLimitCard, readMessagePaywall } from './MessageLimitCard';
import { getStreamErrorMessage } from '../lib/continue-generation';
import { useHostBridge } from '../lib/hostBridge';
import type {
  ChatMessage,
  Artifact,
  Attachment,
  MessageArtifactProjection,
  ToolCall,
} from '../lib/types';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

interface MessageBubbleProps {
  message: ChatMessage;
  /**
   * @deprecated No longer consumed. The assistant action row now renders below
   * every completed message (web parity), not only the last turn. Kept optional
   * so existing callers/tests can still pass it without a type error.
   */
  isLast?: boolean;
  onRetry?: (messageId: string) => void;
  onArtifactClick?: (artifact: Artifact) => void;
  /**
   * Approve/reject one pending tool call (see the `awaiting_approval`
   * `ToolCall.status`). Omit to leave awaiting-approval cards read-only (no
   * fake affordance) — e.g. a host whose runtime lacks
   * `resolveToolApproval`.
   */
  onToolApprove?: (messageId: string, toolCallId: string) => void;
  onToolReject?: (messageId: string, toolCallId: string) => void;
  /**
   * True when this message's suspended approval turn is no longer live (see
   * `ChatRuntime.hasLiveApprovalTurn`'s doc comment) -- awaiting_approval
   * tool cards render an expired notice instead of live buttons, which would
   * otherwise render wired but silently no-op.
   */
  approvalTurnExpired?: boolean;
  /** Resend affordance shown on an expired approval card. Omit to show text guidance only (no fake availability). */
  onResendApproval?: (messageId: string) => void;
  /**
   * Host-derived artifacts for this message plus the body with their fenced
   * blocks stripped (see {@link MessageArtifactProjection}). When absent the
   * bubble falls back to `message.artifacts` / `message.content` exactly as
   * before, so hosts without the derivation capability are unaffected.
   */
  artifactProjection?: MessageArtifactProjection | null;
}

/**
 * Optional projections the runtime dropped to stay inside the managed-cloud
 * message-metadata budget (see `MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH`).
 * Persisted by `CloudRuntime.persistAssistantTurn` so the note survives a
 * reopen — the reply itself is intact, only these side-panels are missing.
 */
function readTrimmedMetadataFields(message: ChatMessage): string[] {
  const raw = message.metadata?.['metadataTrimmed'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

const TRIMMED_FIELD_LABELS: Record<string, string> = {
  artifacts: 'artifacts',
  thinking: 'the thinking trace',
  toolCalls: 'tool call details',
  webSearchResults: 'web search results',
  generatedFiles: 'generated file references',
  agentActivity: 'the activity timeline',
};

export function StreamingThinkingStatus() {
  return (
    <div
      role="status"
      aria-label="Assistant is thinking"
      className="flex items-center gap-2 text-[var(--chat-text-muted)]"
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--chat-accent-primary)]"
      />
      <span className="text-sm">Thinking…</span>
    </div>
  );
}

/**
 * Validate a markdown link URL against an allowlist of safe schemes.
 *
 * Returns the trimmed URL if it is safe to render in `<a href>`, or `null`
 * if the URL has a dangerous scheme (e.g., `javascript:`, `data:`, `vbscript:`).
 *
 * Allowlisted: http(s), mailto, tel, and relative paths starting with `/` or `#`.
 * Anything else (including bare schemes like `javascript:exec` or `data:text/html,…`)
 * is rejected and the caller should render the link text as plain text.
 */
export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  // Allow: http(s):, mailto:, tel:, relative paths starting with / or #
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[/#]/.test(trimmed)) return trimmed;
  return null;
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
              const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
              nodes.push(
                <HeadingTag
                  key={`${i}-${li}`}
                  className={cn(
                    headerClasses[level],
                    'text-[var(--chat-text-primary)] leading-tight',
                  )}
                >
                  {renderInline(text)}
                </HeadingTag>,
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
  // AUDIT-FIX: alert-449 — bound the negated-class quantifiers so adversarial
  // input cannot produce polynomial backtracking even though each alternative
  // is already non-overlapping. 4 KB per inline span is far above realistic.
  const regex =
    /(\[([^\]]{1,4096})\]\(([^)]{1,4096})\)|~~[^~]{1,4096}~~|\*\*[^*]{1,4096}\*\*|\*[^*]{1,4096}\*|`[^`]{1,4096}`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('[') && match[2] && match[3]) {
      // Link: [text](url) — only render anchor for safe schemes (http(s), mailto,
      // tel, relative). javascript:, data:, vbscript: etc. fall back to plain text
      // to prevent XSS via model-generated markdown links.
      const href = safeHref(match[3]);
      if (href !== null) {
        parts.push(
          <a
            key={match.index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--chat-accent-primary)] underline underline-offset-2 hover:opacity-80"
          >
            {match[2]}
          </a>,
        );
      } else {
        parts.push(<span key={match.index}>{match[2]}</span>);
      }
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

/**
 * MarkdownLite — reusable wrapper around the lightweight markdown renderer.
 *
 * Renders headings, lists, tables, code blocks, blockquotes, and inline
 * formatting without pulling in react-markdown. Used by MessageBubble for
 * assistant text and by artifact renderers (e.g. PresentationArtifact slides).
 */
export function MarkdownLite({ content, className }: { content: string; className?: string }) {
  return <div className={className}>{renderContent(content)}</div>;
}

function formatToolArgsPreview(toolCall: ToolCall): string | null {
  const entries = Object.entries(toolCall.args ?? {});
  if (entries.length === 0) {
    return null;
  }

  const preview = entries
    .slice(0, 2)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}: ${value}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(' · ');

  return entries.length > 2 ? `${preview} · …` : preview;
}

function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
  const preview = formatToolArgsPreview(toolCall);
  const hasResult = typeof toolCall.result === 'string' && toolCall.result.trim().length > 0;

  return (
    <div className="rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-2">
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--chat-text-primary)]">
            {toolCall.name}
          </p>
          {preview && (
            <p className="mt-0.5 truncate text-xs text-[var(--chat-text-muted)]">{preview}</p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            toolCall.status === 'failed'
              ? 'bg-red-500/10 text-red-300'
              : toolCall.status === 'completed'
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-blue-500/10 text-blue-300',
          )}
        >
          {toolCall.status ?? 'running'}
        </span>
      </div>

      {hasResult && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-[var(--chat-text-muted)]">Result</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--chat-surface-overlay)] px-3 py-2 text-xs leading-relaxed text-[var(--chat-text-secondary)]">
            {toolCall.result}
          </pre>
        </details>
      )}
    </div>
  );
}

function formatAttachmentSize(size: number | undefined): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(0.1, size / 1024).toFixed(1)} KB`;
  return `${Math.max(0.1, size / (1024 * 1024)).toFixed(1)} MB`;
}

function UserMessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const hostBridge = useHostBridge();
  const [inFlightIds, setInFlightIds] = useState<Record<string, true>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  async function downloadAttachment(attachment: Attachment) {
    const href = attachment.url ? safeHref(attachment.url) : null;
    if (!href) return;

    setInFlightIds((previous) => ({ ...previous, [attachment.id]: true }));
    try {
      const blob = hostBridge?.fetchCloudFile
        ? await hostBridge.fetchCloudFile(href)
        : await (async () => {
            const response = await fetch(href, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.blob();
          })();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setDownloadErrors((previous) => {
        if (!(attachment.id in previous)) return previous;
        const next = { ...previous };
        delete next[attachment.id];
        return next;
      });
    } catch {
      setDownloadErrors((previous) => ({
        ...previous,
        [attachment.id]: 'Download failed. Try again.',
      }));
    } finally {
      setInFlightIds((previous) => {
        const next = { ...previous };
        delete next[attachment.id];
        return next;
      });
    }
  }

  return (
    <div className="flex max-w-full flex-wrap justify-end gap-2" aria-label="Message attachments">
      {attachments.map((attachment) => {
        const isImage = attachment.type.toLowerCase().startsWith('image/');
        const isDownloading = Boolean(inFlightIds[attachment.id]);
        const hasDownload = Boolean(attachment.url && safeHref(attachment.url));
        const size = formatAttachmentSize(attachment.size);

        return (
          <div key={attachment.id} className="max-w-full">
            <div className="flex min-w-0 max-w-[19rem] items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-surface-overlay)] text-[var(--chat-text-secondary)]">
                {isImage ? (
                  <ImageIcon className="h-4 w-4" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--chat-text-primary)]">
                  {attachment.name}
                </span>
                <span className="block truncate text-xs text-[var(--chat-text-muted)]">
                  {[attachment.type || 'File', size].filter(Boolean).join(' · ')}
                </span>
              </span>
              {hasDownload && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isDownloading}
                  aria-label={
                    isDownloading ? `Downloading ${attachment.name}` : `Download ${attachment.name}`
                  }
                  onClick={() => void downloadAttachment(attachment)}
                  className="h-8 w-8 shrink-0 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
                >
                  <Download className={cn('h-4 w-4', isDownloading && 'animate-pulse')} />
                </Button>
              )}
            </div>
            {downloadErrors[attachment.id] && (
              <p role="alert" className="mt-1 text-right text-xs text-red-400">
                {downloadErrors[attachment.id]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MessageBubble({
  message,
  onRetry,
  onArtifactClick,
  onToolApprove,
  onToolReject,
  approvalTurnExpired,
  onResendApproval,
  artifactProjection,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = Boolean(message.isStreaming);
  const canonicalActivity = message.metadata?.['agentActivity'] as AgentActivityState | undefined;
  const [copied, setCopied] = useState(false);
  // Derived artifacts (host capability) win over the pre-attached list because
  // the projection already merged `message.artifacts` into itself on id.
  const renderedArtifacts = artifactProjection?.artifacts ?? message.artifacts;
  // Body text only. Copy/ActionBar keep `message.content` so the user can still
  // copy the code the artifact card lifted out (web parity).
  const bodyContent = artifactProjection?.displayContent ?? message.content;
  const trimmedMetadataFields = isUser ? [] : readTrimmedMetadataFields(message);
  const hostBridge = useHostBridge();
  // Managed quota / rate-limit refusal (see MessageLimitCard + useChat's
  // `error` stream case). Takes precedence over the generic failure block.
  const paywallBlock = isUser ? null : readMessagePaywall(message.metadata);
  // A failed turn used to render a completely blank bubble: `message.error`
  // was written and never read, and the list-level notice only covers the LAST
  // message, so a mid-transcript failure was invisible. Fall back to the
  // PERSISTED `metadata.streamError` so the failure survives a reload too.
  const failureMessage =
    isUser || isStreaming || paywallBlock
      ? undefined
      : (message.error ?? getStreamErrorMessage(message));

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed silently — shared package renders no toast
    }
  }

  function handleDownloadArtifact(artifact: Artifact) {
    const ext =
      artifact.type === 'html'
        ? 'html'
        : artifact.type === 'react'
          ? 'tsx'
          : artifact.type === 'markdown'
            ? 'md'
            : artifact.type === 'json'
              ? 'json'
              : artifact.type === 'svg'
                ? 'svg'
                : artifact.type === 'document'
                  ? 'md'
                  : artifact.type === 'image'
                    ? 'png'
                    : (artifact.language ?? 'txt');
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(artifact.title ?? 'artifact').replace(/\s+/g, '-').toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isUser) {
    return (
      <div
        data-role="user"
        className="group message-enter flex max-w-[85%] min-w-0 flex-col items-end gap-1"
      >
        {message.attachments && message.attachments.length > 0 && (
          <UserMessageAttachments attachments={message.attachments} />
        )}
        {/* Right-aligned rounded bubble (web .user-bubble parity: px-4 py-2.5,
            radius-2xl, --chat-user-bubble-bg). No per-message timestamp — the
            web feed uses date dividers + provenance for time cues, not a stamp
            under every user turn. */}
        <div
          className={cn(
            'w-fit max-w-full rounded-2xl bg-[var(--chat-user-bubble-bg)] px-4 py-2.5',
            'text-[15px] leading-relaxed text-[var(--chat-text-primary)]',
            'whitespace-pre-wrap break-words',
          )}
        >
          {message.content}
        </div>
        {/* Hover-only copy (web parity: user actions reveal on hover). Copy is
            fully self-contained; no other user actions are wired on desktop.
            AUDIT-FIX GOV-30: `opacity-0 group-hover:opacity-100` had no focus
            counterpart, so a keyboard user tabbed into a fully transparent
            button — focus ring included. `group-focus-within` reveals it. */}
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            aria-label={copied ? 'Copied' : 'Copy message'}
            onClick={handleCopy}
            className={cn(
              // AUDIT-FIX GOV-38: 44px touch target on phones (28px was below
              // the minimum), compact on pointer viewports.
              'h-11 w-11 touch-manipulation sm:h-7 sm:w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              copied && 'text-[var(--chat-accent-secondary)]',
            )}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </Button>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div data-role="assistant" className="message-enter flex flex-col gap-1">
      {canonicalActivity && (
        <div className="mb-2">
          <AgentActivityTimeline
            activity={canonicalActivity}
            onApprove={
              onToolApprove ? (toolCallId) => onToolApprove(message.id, toolCallId) : undefined
            }
            onReject={
              onToolReject ? (toolCallId) => onToolReject(message.id, toolCallId) : undefined
            }
            isApprovalExpired={() => Boolean(approvalTurnExpired)}
            onResend={onResendApproval ? () => onResendApproval(message.id) : undefined}
          />
        </div>
      )}

      {/* Thinking block — rendered above text content */}
      {!canonicalActivity && message.thinkingBlock && (
        <ThinkingBlock block={message.thinkingBlock} />
      )}

      {/* Web search results — rendered above text content */}
      {!canonicalActivity &&
        message.webSearchResults?.map((search) => (
          <LegacyWebSearchCard key={search.id} search={search} />
        ))}

      <div className="text-[15px] leading-relaxed text-[var(--chat-text-primary)] break-words">
        {isStreaming && !message.content.trim() && !canonicalActivity ? (
          /* Pre-first-token placeholder (web parity): a pulsing dot + "Thinking…"
             instead of a bare blinking caret on an empty bubble. */
          <StreamingThinkingStatus />
        ) : (
          <>
            {renderContent(bodyContent)}
            {isStreaming && (
              <span
                aria-hidden
                className="inline-block w-0.5 h-4 bg-[var(--chat-text-primary)] ml-0.5 align-middle animate-pulse"
              />
            )}
          </>
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

      {!canonicalActivity && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-2">
          {message.toolCalls.map((toolCall) =>
            // Awaiting-approval calls need the approve/reject affordance
            // ToolCallCard already implements — every other status keeps the
            // existing lightweight ToolCallRow unchanged.
            toolCall.status === 'awaiting_approval' ? (
              <ToolCallCard
                key={toolCall.id}
                id={toolCall.id}
                name={toolCall.name}
                status="awaiting_approval"
                requiresApproval
                args={toolCall.args}
                onApprove={onToolApprove ? () => onToolApprove(message.id, toolCall.id) : undefined}
                onReject={onToolReject ? () => onToolReject(message.id, toolCall.id) : undefined}
                expired={approvalTurnExpired}
                onResend={onResendApproval ? () => onResendApproval(message.id) : undefined}
              />
            ) : (
              <ToolCallRow key={toolCall.id} toolCall={toolCall} />
            ),
          )}
        </div>
      )}

      {renderedArtifacts && renderedArtifacts.length > 0 && (
        <div className="mt-2" data-testid="message-artifacts">
          {renderedArtifacts.map((artifact) => (
            <DownloadCard
              key={artifact.id}
              artifact={artifact}
              onClick={onArtifactClick ? () => onArtifactClick(artifact) : undefined}
              onDownload={() => handleDownloadArtifact(artifact)}
            />
          ))}
        </div>
      )}

      {/* Managed-cloud sandbox files (x_generated_files) — shared cards with
          an authed Download action. Never present on Local-mode messages.
          Also renders while an E2B execution tool is still running so the
          user sees an honest "Running code…" strip before any file exists. */}
      {((message.generatedFiles && message.generatedFiles.length > 0) ||
        hasRunningExecutionTool(message)) && <MessageGeneratedFiles message={message} />}

      {/* Action row (web parity): assistant actions sit below EVERY completed
          message, always visible — not only the last turn. ActionBar renders
          Copy (self-contained); retry/feedback appear only when their handlers
          are wired (honest omission on desktop today). `isLast` no longer gates
          the row. */}
      {/* The reply saved, but one or more optional side-panels were too large
          for the managed-cloud metadata budget and were dropped on save. Say so
          instead of letting the user find an empty Thinking/Artifacts panel
          after a reload and assume the app lost the answer. */}
      {trimmedMetadataFields.length > 0 && (
        <p
          role="note"
          data-testid="message-metadata-trimmed"
          className="mt-2 text-xs text-[var(--chat-text-muted)]"
        >
          {`This reply was saved, but ${trimmedMetadataFields
            .map((field) => TRIMMED_FIELD_LABELS[field] ?? field)
            .join(
              ', ',
            )} ${trimmedMetadataFields.length === 1 ? 'was' : 'were'} too large to store with it.`}
        </p>
      )}

      {/* Managed quota / rate-limit refusal — the reason, the reset time the
          server actually reported, and (only when the host exposes checkout)
          the upgrade that lifts it. Replaces a vanishing toast over an empty
          bubble. */}
      {paywallBlock && (
        <MessageLimitCard
          block={paywallBlock}
          {...(onRetry ? { onRetry: () => onRetry(message.id) } : {})}
          {...(hostBridge?.openUpgrade
            ? { onUpgrade: () => hostBridge.openUpgrade?.(paywallBlock.requiredTier) }
            : {})}
        />
      )}

      {/* Failed turn — render the failure IN the transcript next to a Retry
          instead of leaving a blank bubble whose only signal was a toast that
          has already disappeared. */}
      {failureMessage && (
        <div
          role="alert"
          data-testid="message-error"
          className="mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{
            background: 'var(--chat-surface-elevated)',
            borderColor: 'var(--chat-destructive)',
            color: 'var(--chat-text-secondary)',
          }}
        >
          <AlertTriangle
            size={14}
            aria-hidden="true"
            className="mt-px shrink-0"
            style={{ color: 'var(--chat-destructive)' }}
          />
          <span className="min-w-0 flex-1 break-words">{failureMessage}</span>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              aria-label="Retry this response"
              className="shrink-0 rounded-md px-2 py-1 font-medium transition-colors hover:bg-[var(--chat-surface-hover)]"
              style={{ color: 'var(--chat-destructive)' }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!isStreaming && (
        <ActionBar messageId={message.id} content={message.content} onRetry={onRetry} />
      )}
    </div>
  );
}
