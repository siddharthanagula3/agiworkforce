import { useState } from 'react';
import { Eye, Code2, Copy, ChevronDown, RotateCcw, X, Download, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import type { Artifact } from '../lib/types';

export interface ArtifactPanelProps {
  artifact: Artifact | null;
  viewMode: 'preview' | 'code';
  onViewModeChange: (mode: 'preview' | 'code') => void;
  onClose: () => void;
}

function getTypeLabel(artifact: Artifact): string {
  switch (artifact.type) {
    case 'html':
      return 'HTML';
    case 'react':
      return 'React';
    case 'markdown':
      return 'Markdown';
    case 'json':
      return 'JSON';
    case 'code':
      return artifact.language?.toUpperCase() ?? 'Code';
    case 'document':
      return 'Document';
    case 'research':
      return 'Research';
    case 'svg':
      return 'SVG';
    case 'mermaid':
      return 'Mermaid';
    case 'image':
      return 'Image';
    default:
      return 'Artifact';
  }
}

function getTypeCategory(artifact: Artifact): string {
  switch (artifact.type) {
    case 'html':
    case 'react':
    case 'code':
    case 'svg':
    case 'mermaid':
    case 'json':
      return 'Code';
    case 'document':
    case 'markdown':
      return 'Document';
    case 'research':
      return 'Research';
    default:
      return 'Artifact';
  }
}

function CodeView({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed silently
    }
  }

  const lines = content.split('\n');

  return (
    <div className="relative flex-1 overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={copied ? 'Copied' : 'Copy code'}
        onClick={handleCopy}
        className={cn(
          'absolute top-2 right-2 z-10 h-7 w-7',
          'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
          copied && 'text-[var(--chat-accent-secondary)]',
        )}
      >
        <Copy size={13} />
      </Button>

      <div className="h-full overflow-auto bg-[var(--chat-surface-overlay)]">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="hover:bg-[var(--chat-surface-hover)]/40">
                <td
                  className="select-none pr-4 pl-4 text-right text-[13px] font-mono text-[var(--chat-text-muted)] w-12 min-w-12"
                  aria-hidden
                >
                  {index + 1}
                </td>
                <td className="pr-4 text-[13px] font-mono text-[var(--chat-text-primary)] whitespace-pre leading-relaxed">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DropdownMenu({
  onDownload,
  onPublish,
}: {
  onDownload: () => void;
  onPublish: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="More options"
        onClick={() => setOpen((prev) => !prev)}
        className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
      >
        <ChevronDown size={14} />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-20 min-w-[140px]',
              'rounded-[var(--chat-radius-md)] border border-[var(--chat-border)]',
              'bg-[var(--chat-surface-elevated)] shadow-lg',
              'py-1',
            )}
          >
            <button
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm',
                'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'transition-colors',
              )}
              onClick={() => {
                onDownload();
                setOpen(false);
              }}
            >
              <Download size={13} />
              Download
            </button>
            <button
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-sm',
                'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                'transition-colors',
              )}
              onClick={() => {
                onPublish();
                setOpen(false);
              }}
            >
              <Globe size={13} />
              Publish
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ArtifactPanel({
  artifact,
  viewMode,
  onViewModeChange,
  onClose,
}: ArtifactPanelProps) {
  const [headerCopied, setHeaderCopied] = useState(false);

  async function handleCopyContent() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 1500);
    } catch {
      // clipboard write failed silently
    }
  }

  function handleDownload() {
    if (!artifact) return;
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
                  : (artifact.language ?? 'txt');
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(artifact.title ?? 'artifact').replace(/\s+/g, '-').toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePublish() {
    // Publish is a future feature — no-op for now
  }

  const canPreview =
    artifact?.type === 'html' ||
    artifact?.type === 'react' ||
    artifact?.type === 'svg' ||
    artifact?.type === 'markdown' ||
    artifact?.type === 'document' ||
    artifact?.type === 'image';

  return (
    <div className="flex h-full flex-col bg-[var(--chat-surface-base)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--chat-border)] px-3">
        {/* Left: view mode toggles */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Preview mode"
            onClick={() => onViewModeChange('preview')}
            disabled={!canPreview}
            className={cn(
              'h-7 w-7',
              viewMode === 'preview' && canPreview
                ? 'text-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10'
                : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              !canPreview && 'opacity-40 cursor-not-allowed',
            )}
          >
            <Eye size={14} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Code mode"
            onClick={() => onViewModeChange('code')}
            className={cn(
              'h-7 w-7',
              viewMode === 'code'
                ? 'text-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/10'
                : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
            )}
          >
            <Code2 size={14} />
          </Button>
        </div>

        <div className="h-4 w-px bg-[var(--chat-border)]" />

        {/* Center: title + type */}
        <div className="flex flex-1 items-center gap-1.5 min-w-0 overflow-hidden">
          {artifact ? (
            <span className="truncate text-sm font-medium text-[var(--chat-text-secondary)]">
              {artifact.title ?? 'Untitled artifact'}
              <span className="text-[var(--chat-text-muted)] font-normal"> · </span>
              <span className="text-[var(--chat-text-muted)] font-normal">
                {getTypeCategory(artifact)} · {getTypeLabel(artifact)}
              </span>
            </span>
          ) : (
            <span className="text-sm text-[var(--chat-text-muted)]">No artifact</span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label={headerCopied ? 'Copied' : 'Copy content'}
            onClick={handleCopyContent}
            disabled={!artifact}
            className={cn(
              'h-7 w-7',
              'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
              headerCopied && 'text-[var(--chat-accent-secondary)]',
            )}
          >
            <Copy size={13} />
          </Button>

          <DropdownMenu onDownload={handleDownload} onPublish={handlePublish} />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Retry"
            disabled={!artifact}
            className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            <RotateCcw size={13} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Close panel"
            onClick={onClose}
            className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {!artifact ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--chat-text-muted)]">
            No artifact selected
          </div>
        ) : viewMode === 'preview' && artifact.type === 'svg' ? (
          // SVG: render as <img> to prevent script execution — no allow-scripts
          <div className="flex h-full items-center justify-center overflow-auto p-4 bg-white">
            <img
              src={`data:image/svg+xml;base64,${btoa(artifact.content)}`}
              alt={artifact.title ?? 'Artifact preview'}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : viewMode === 'preview' && artifact.type === 'image' ? (
          <div className="flex h-full items-center justify-center overflow-auto bg-[var(--chat-surface-overlay)] p-4">
            <img
              src={artifact.content}
              alt={artifact.title ?? 'Artifact image'}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        ) : viewMode === 'preview' &&
          (artifact.type === 'markdown' || artifact.type === 'document') ? (
          <div className="h-full overflow-auto bg-[var(--chat-surface-overlay)] px-5 py-4">
            <article className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--chat-text-primary)]">
              {artifact.content}
            </article>
          </div>
        ) : viewMode === 'preview' && canPreview ? (
          // HTML/React: sandboxed iframe without allow-scripts is safe for layout-only preview
          <iframe
            srcDoc={artifact.content}
            sandbox="allow-forms"
            className="h-full w-full border-0 bg-white"
            title={artifact.title ?? 'Artifact preview'}
          />
        ) : (
          <CodeView content={artifact.content} />
        )}
      </div>
    </div>
  );
}
