import { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  Wrench,
  Pencil,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button, useUiTranslation } from '@agiworkforce/ui';
import { ActionBar } from './ActionBar';
import { ThinkingBlock } from './ThinkingBlock';
import { LegacyWebSearchCard } from './WebSearchCard';
import { CitationPill } from './CitationPill';
import { DownloadCard } from './DownloadCard';
import { MessageGeneratedFiles, hasRunningExecutionTool } from './MessageGeneratedFiles';
import {
  CodeExecutionOutput,
  isExecutingCode,
  readCodeExecutionResult,
} from './CodeExecutionOutput';
import { ToolCallCard } from './ToolCallCard';
import { AgentActivityTimeline, hasCanonicalToolActivity } from './AgentActivityTimeline';
import { MessageLimitCard, readMessagePaywall } from './MessageLimitCard';
import { artifactDownloadFile } from '../lib/artifact-download';
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
  onToolApprove?: (messageId: string, toolCallId: string) => void;
  onToolReject?: (messageId: string, toolCallId: string) => void;
  approvalTurnExpired?: boolean;
  onResendApproval?: (messageId: string) => void;
  /**
   * Host-derived artifacts for this message plus the body with their fenced
   * blocks stripped (see {@link MessageArtifactProjection}). When absent the
   * bubble falls back to `message.artifacts` / `message.content` exactly as
   * before, so hosts without the derivation capability are unaffected.
   */
  artifactProjection?: MessageArtifactProjection | null;
  onEdit?: (messageId: string, newContent: string) => void;
}

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
  const { t } = useUiTranslation('chat');

  return (
    <div
      role="status"
      aria-label={t('bubble.assistantThinking', 'Assistant is thinking')}
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

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  // browsers strip embedded control characters, so '/<TAB>/evil.com' resolves cross-origin
  if (hasControlCharacter(trimmed)) return null;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  // a same-app path is exactly one leading '/'; '//host' and '/\host' are cross-origin
  if (/^\/(?![/\\])/.test(trimmed)) return trimmed;
  return null;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const { t } = useUiTranslation('chat');
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
            aria-label={copied ? t('bubble.copied', 'Copied') : t('bubble.copyCode', 'Copy code')}
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
            aria-label={copied ? t('bubble.copied', 'Copied') : t('bubble.copyCode', 'Copy code')}
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

function renderContent(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const parts = content.split(/(```[\s\S]*?```)/g);

  parts.forEach((part, i) => {
    if (part.startsWith('```')) {
      const lines = part.slice(3).split('\n');
      const lang = lines[0]?.trim() || undefined;
      const body = lines
        .slice(1, lines[lines.length - 1]?.trim() === '```' ? -1 : undefined)
        .join('\n');
      nodes.push(<CodeBlock key={i} code={body} language={lang} />);
    } else {
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
        const orderedMatch = /^\s{0,10}\d+[.)]\s(.+)$/.exec(line);
        const unorderedMatch = /^\s{0,10}[-*]\s(.+)$/.exec(line);
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

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
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
  const { t } = useUiTranslation('chat');
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
          <summary className="cursor-pointer text-xs text-[var(--chat-text-muted)]">
            {t('bubble.toolResult', 'Result')}
          </summary>
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
  const { t } = useUiTranslation('chat');
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
        [attachment.id]: t('bubble.downloadFailed', 'Download failed. Try again.'),
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
    <div
      className="flex max-w-full flex-wrap justify-end gap-2"
      aria-label={t('bubble.messageAttachments', 'Message attachments')}
    >
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
                  {[attachment.type || t('bubble.file', 'File'), size].filter(Boolean).join(' · ')}
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

function UserBubbleBody({ content }: { content: string }) {
  return (
    <div
      className={cn(
        'w-fit max-w-full rounded-2xl bg-[var(--chat-user-bubble-bg)] px-4 py-2.5',
        'text-[15px] leading-relaxed text-[var(--chat-text-primary)]',
        'whitespace-pre-wrap break-words',
      )}
    >
      {content}
    </div>
  );
}

function UserBubbleActions({
  copied,
  onCopy,
  onStartEdit,
  t,
}: {
  copied: boolean;
  onCopy: () => void;
  onStartEdit?: (() => void) | undefined;
  t: (key: string, fallback: string) => string;
}) {
  const iconButton =
    'h-11 w-11 touch-manipulation sm:h-7 sm:w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]';

  return (
    <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon"
        aria-label={copied ? t('bubble.copied', 'Copied') : t('bubble.copyMessage', 'Copy message')}
        onClick={onCopy}
        className={cn(iconButton, copied && 'text-[var(--chat-accent-secondary)]')}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Button>
      {onStartEdit && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('bubble.editMessage', 'Edit message')}
          onClick={onStartEdit}
          className={iconButton}
        >
          <Pencil size={13} />
        </Button>
      )}
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
  onEdit,
}: MessageBubbleProps) {
  const { t } = useUiTranslation('chat');
  const isUser = message.role === 'user';
  const isStreaming = Boolean(message.isStreaming);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const canonicalActivity = message.metadata?.['agentActivity'] as AgentActivityState | undefined;
  const canonicalOwnsToolActivity = hasCanonicalToolActivity(canonicalActivity);
  const [copied, setCopied] = useState(false);
  const renderedArtifacts = artifactProjection?.artifacts ?? message.artifacts;
  const bodyContent = artifactProjection?.displayContent ?? message.content;
  const trimmedMetadataFields = isUser ? [] : readTrimmedMetadataFields(message);
  const hostBridge = useHostBridge();
  const paywallBlock = isUser ? null : readMessagePaywall(message.metadata);
  const codeExecutionResult = isUser ? undefined : readCodeExecutionResult(message.metadata);
  const codeExecutionRunning = !isUser && !codeExecutionResult && isExecutingCode(message);
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
    const { blob, fileName } = artifactDownloadFile(artifact);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isEditing = editDraft !== null;

  function commitEdit() {
    const next = (editDraft ?? '').trim();
    if (next.length > 0 && next !== message.content) onEdit?.(message.id, next);
    setEditDraft(null);
  }

  if (isUser) {
    return (
      <div
        data-role="user"
        data-testid="message-item"
        className="group message-enter flex max-w-[85%] min-w-0 flex-col items-end gap-1"
      >
        {message.attachments && message.attachments.length > 0 && (
          <UserMessageAttachments attachments={message.attachments} />
        )}
        {isEditing ? (
          <div className="flex w-full flex-col items-stretch gap-2">
            <textarea
              data-editing="true"
              aria-label={t('bubble.editMessage', 'Edit message')}
              value={editDraft ?? ''}
              onChange={(event) => setEditDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  commitEdit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditDraft(null);
                }
              }}
              rows={Math.min(12, (editDraft ?? '').split('\n').length + 1)}
              autoFocus
              className={cn(
                'w-full resize-y rounded-2xl bg-[var(--chat-user-bubble-bg)] px-4 py-2.5',
                'text-[15px] leading-relaxed text-[var(--chat-text-primary)]',
                'outline-none ring-1 ring-[var(--chat-accent-secondary)]',
              )}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditDraft(null)}>
                <X size={13} className="mr-1" />
                {t('bubble.cancelEdit', 'Cancel')}
              </Button>
              <Button variant="default" size="sm" onClick={commitEdit}>
                {t('bubble.saveEdit', 'Save')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <UserBubbleBody content={message.content} />
            <UserBubbleActions
              copied={copied}
              onCopy={handleCopy}
              onStartEdit={onEdit ? () => setEditDraft(message.content) : undefined}
              t={t}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      data-role="assistant"
      data-testid="message-item"
      className="message-enter flex flex-col gap-1"
    >
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

      {!canonicalOwnsToolActivity && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-2">
          {message.toolCalls.map((toolCall) =>
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

      {(codeExecutionRunning || codeExecutionResult) && (
        <CodeExecutionOutput isExecuting={codeExecutionRunning} result={codeExecutionResult} />
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
        (hasRunningExecutionTool(message) && !codeExecutionRunning)) && (
        <MessageGeneratedFiles message={message} />
      )}

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
              aria-label={t('bubble.retryResponse', 'Retry this response')}
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
