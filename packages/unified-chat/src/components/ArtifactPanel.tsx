import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Eye,
  Globe,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ARTIFACT_SANDBOX_ATTR, buildSandboxedHtml } from '../lib/artifact-sandbox';
import { Button } from './ui/Button';
import type { Artifact } from '../lib/types';
import { ReactPreview } from './artifact-components/ReactPreview';

export interface ArtifactPanelProps {
  artifact: Artifact | null;
  viewMode: 'preview' | 'code';
  onViewModeChange: (mode: 'preview' | 'code') => void;
  onClose: () => void;
  /**
   * Optional version history for the current artifact. When provided with
   * more than one entry, the header renders a prev/next stepper so the user
   * can navigate edits. Round-2 audit P0 #9 (Artifacts versioning,
   * 2026-05-21). Host apps build this from the artifactStore by grouping
   * artifacts that share a `title` (or a stable group id) per conversation.
   */
  versions?: Artifact[];
  /** Called when the user picks a different version from the stepper. */
  onSelectVersion?: (artifact: Artifact) => void;
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
  versions,
  onSelectVersion,
}: ArtifactPanelProps) {
  const [headerCopied, setHeaderCopied] = useState(false);
  // Run/Stop control for HTML preview. Defaults to running; pausing strips
  // the iframe and re-mounts on resume. The toggle only appears when the
  // current artifact is HTML — React previews own their own reload UX, and
  // layout-only artifact types (markdown, document, svg, image) never run
  // scripts so a pause control would be misleading.
  const [htmlPreviewRunning, setHtmlPreviewRunning] = useState(true);

  // The host supplies versions ordered oldest-first; the stepper trusts
  // that ordering and maps array indices to "v1 / v2 / ..." labels. When
  // the host omits versions or supplies only one entry, the stepper hides.
  const sortedVersions = useMemo<Artifact[]>(() => {
    if (!versions || versions.length === 0) return [];
    return versions;
  }, [versions]);

  const currentVersionIndex = useMemo(() => {
    if (!artifact || sortedVersions.length === 0) return -1;
    return sortedVersions.findIndex((v) => v.id === artifact.id);
  }, [artifact, sortedVersions]);

  const hasPreviousVersion = currentVersionIndex > 0;
  const hasNextVersion =
    currentVersionIndex >= 0 && currentVersionIndex < sortedVersions.length - 1;

  function goToVersion(index: number): void {
    if (index < 0 || index >= sortedVersions.length) return;
    const next = sortedVersions[index];
    if (next) onSelectVersion?.(next);
  }

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

  async function handlePublish() {
    // Round-2 audit P0 #9 (2026-05-21). Cloud-side artifact publishing
    // arrives with Cloud Managed; until then "Publish" copies a portable
    // self-contained snapshot to the clipboard so the user can paste it
    // into a doc, chat thread, or GitHub gist as a fallback.
    if (!artifact) return;
    const snapshot = [
      `# ${artifact.title ?? 'Untitled artifact'}`,
      `Type: ${getTypeLabel(artifact)}${artifact.language ? ` (${artifact.language})` : ''}`,
      '',
      '```' + (artifact.language ?? ''),
      artifact.content,
      '```',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(snapshot);
      // Reuse the existing copied-state feedback channel so the toolbar
      // briefly shows the check.
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 1500);
    } catch {
      // Clipboard write may fail (insecure context, denied permission) —
      // fall back to a data-URL download so the user still gets the bytes.
      const blob = new Blob([snapshot], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(artifact.title ?? 'artifact').replace(/\s+/g, '-').toLowerCase()}-snapshot.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const canPreview =
    artifact?.type === 'html' ||
    artifact?.type === 'react' ||
    artifact?.type === 'svg' ||
    artifact?.type === 'markdown' ||
    artifact?.type === 'document' ||
    artifact?.type === 'image';

  // Pre-build the sandboxed HTML once per artifact swap. Empty when paused.
  const sandboxedHtmlSrcDoc = useMemo<string>(() => {
    if (!artifact || artifact.type !== 'html') return '';
    if (!htmlPreviewRunning) return '';
    try {
      return buildSandboxedHtml(artifact.content);
    } catch {
      return '';
    }
  }, [artifact, htmlPreviewRunning]);

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

        {/* Version stepper — only when host supplies a version history */}
        {sortedVersions.length > 1 && artifact ? (
          <div
            className="flex items-center gap-0.5 shrink-0 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-1"
            aria-label="Artifact version stepper"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous version"
              disabled={!hasPreviousVersion}
              onClick={() => goToVersion(currentVersionIndex - 1)}
              className={cn(
                'h-6 w-6',
                hasPreviousVersion
                  ? 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]'
                  : 'text-[var(--chat-text-muted)] opacity-40 cursor-not-allowed',
              )}
            >
              <ChevronLeft size={13} />
            </Button>
            <span className="px-1 text-[11px] font-mono tabular-nums text-[var(--chat-text-secondary)]">
              v{currentVersionIndex + 1}/{sortedVersions.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next version"
              disabled={!hasNextVersion}
              onClick={() => goToVersion(currentVersionIndex + 1)}
              className={cn(
                'h-6 w-6',
                hasNextVersion
                  ? 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]'
                  : 'text-[var(--chat-text-muted)] opacity-40 cursor-not-allowed',
              )}
            >
              <ChevronRight size={13} />
            </Button>
          </div>
        ) : null}

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
        ) : viewMode === 'preview' && artifact.type === 'react' ? (
          // React: delegate to the in-package ReactPreview, which spins up a
          // sandboxed iframe with Babel + React from CDN and posts back ready/
          // error events. Round-2 audit P0 #9 live React preview.
          <ReactPreview code={artifact.content} className="h-full" />
        ) : viewMode === 'preview' && artifact.type === 'html' ? (
          // HTML: sandboxed iframe with CSP meta injection + Run/Stop control.
          // Uses the shared `buildSandboxedHtml` so the security envelope cannot
          // drift between ArtifactPanel and ArtifactRenderer.HtmlArtifact.
          <div className="flex h-full flex-col" data-testid="artifact-panel-html-preview">
            <div className="flex items-center gap-2 border-b border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-3 py-1.5">
              <Globe size={12} className="text-[var(--chat-text-muted)]" />
              <span className="text-[11px] text-[var(--chat-text-muted)]">HTML preview</span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                aria-label={htmlPreviewRunning ? 'Stop preview' : 'Run preview'}
                onClick={() => setHtmlPreviewRunning((prev) => !prev)}
                className="h-6 w-6 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
              >
                {htmlPreviewRunning ? <Pause size={12} /> : <Play size={12} />}
              </Button>
            </div>
            {htmlPreviewRunning && sandboxedHtmlSrcDoc ? (
              <iframe
                srcDoc={sandboxedHtmlSrcDoc}
                sandbox={ARTIFACT_SANDBOX_ATTR}
                referrerPolicy="no-referrer"
                className="flex-1 w-full border-0 bg-white"
                title={artifact.title ?? 'Artifact preview'}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[var(--chat-text-muted)]">
                <button
                  type="button"
                  onClick={() => setHtmlPreviewRunning(true)}
                  className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-3 py-1.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] transition-colors"
                >
                  Run preview
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'preview' && canPreview ? (
          // Fallback for any future preview-able artifact types not handled
          // above. Layout-only sandbox: no scripts, no modals, no forms.
          <iframe
            srcDoc={artifact.content}
            sandbox=""
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
