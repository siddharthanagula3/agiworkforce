/**
 * GeneratedFileCard — surface-agnostic card for a `GeneratedFile` from a
 * compute session (PDF / DOCX / XLSX / image / archive / etc.).
 *
 * Closes the shared-package half of the suite-transformation TODO:
 *   "Add Web/Mobile/Desktop generated-file request, status, preview,
 *    download, share, source session, and privacy-label UI."
 *
 * The component is presentation-only — host apps build a
 * `GeneratedFilePresentation` via `summarizeGeneratedFileBundle` (from
 * `@agiworkforce/types`) and pass it in, plus action callbacks for
 * download / share / source-session navigation. Surfaces in Local mode
 * can omit `onShare` to hide the share affordance; Cloud Managed surfaces
 * can omit `onDownload` while a transfer approval is pending.
 *
 * Round-7 autonomous suite-transformation slice, 2026-05-21.
 */

import { useEffect, useState, type ReactElement } from 'react';
import {
  AlertTriangle,
  Archive,
  Clock,
  Code2,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Play,
  Presentation,
  Share2,
  ShieldCheck,
  Video,
} from 'lucide-react';
import type { GeneratedFileKind, GeneratedFilePresentation } from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { Button } from '@agiworkforce/ui';

export interface GeneratedFileCardProps {
  presentation: GeneratedFilePresentation;
  onDownload?: () => void;
  onShare?: () => void;
  onOpenSourceSession?: () => void;
  onPreview?: () => void;
  onPreviewError?: () => void;
  className?: string;
}

function getKindIcon(kindLabel: string): ReactElement {
  const lower = kindLabel.toLowerCase();
  if (lower.includes('pdf')) {
    return <FileText size={16} className="text-rose-400" aria-hidden />;
  }
  if (lower.includes('word') || lower.includes('docx') || lower.includes('document')) {
    return <FileText size={16} className="text-sky-400" aria-hidden />;
  }
  if (
    lower.includes('excel') ||
    lower.includes('xlsx') ||
    lower.includes('csv') ||
    lower.includes('spreadsheet')
  ) {
    return <FileSpreadsheet size={16} className="text-emerald-400" aria-hidden />;
  }
  if (lower.includes('pptx') || lower.includes('presentation')) {
    return <Presentation size={16} className="text-amber-400" aria-hidden />;
  }
  if (lower.includes('archive') || lower.includes('zip')) {
    return <Archive size={16} className="text-zinc-300" aria-hidden />;
  }
  if (lower.includes('image')) {
    return <ImageIcon size={16} className="text-fuchsia-400" aria-hidden />;
  }
  if (lower.includes('html')) {
    return <Code2 size={16} className="text-orange-400" aria-hidden />;
  }
  return <Layers size={16} className="text-zinc-400" aria-hidden />;
}

// `GeneratedFileKind` has no video member, so a video asset arrives with the
// generic "File" kind label; its mime type is the only reliable signal.
function isVideoPresentation(presentation: GeneratedFilePresentation): boolean {
  return (
    (presentation.mimeType ?? '').toLowerCase().startsWith('video/') ||
    presentation.kindLabel.toLowerCase().includes('video')
  );
}

function VideoMarker({ overlay }: { overlay: boolean }) {
  return (
    <span
      data-testid="generated-file-video-marker"
      role="img"
      aria-label="Video"
      className={cn(
        'flex items-center justify-center',
        overlay ? 'pointer-events-none absolute inset-0 rounded-md bg-black/40' : 'h-full w-full',
      )}
    >
      {overlay ? (
        <Play className="h-4 w-4 fill-white text-white" aria-hidden />
      ) : (
        <Video size={16} className="text-indigo-300" aria-hidden />
      )}
    </span>
  );
}

function StatusBadge({ presentation }: { presentation: GeneratedFilePresentation }) {
  if (presentation.isRunning) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {presentation.statusLabel}
      </span>
    );
  }
  if (presentation.isFailed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-300">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {presentation.statusLabel}
      </span>
    );
  }
  if (presentation.isComplete) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        {presentation.statusLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
      <Clock className="h-3 w-3" aria-hidden />
      {presentation.statusLabel}
    </span>
  );
}

export function GeneratedFileCard({
  presentation,
  onDownload,
  onShare,
  onOpenSourceSession,
  onPreview,
  onPreviewError,
  className,
}: GeneratedFileCardProps) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const isVideo = isVideoPresentation(presentation);

  useEffect(() => {
    setPreviewFailed(false);
  }, [presentation.previewUri]);

  const downloadEnabled = presentation.canDownload && presentation.isComplete && !!onDownload;
  const shareEnabled = presentation.canShare && presentation.isComplete && !!onShare;
  const previewEnabled =
    !previewFailed &&
    presentation.canPreview &&
    !!onPreview &&
    (presentation.previewUri ?? presentation.primaryUri);

  return (
    <div
      data-testid="generated-file-card"
      data-generated-file-id={presentation.generatedFileId ?? undefined}
      className={cn(
        'flex h-full flex-col gap-3 rounded-[var(--chat-radius-md)] border border-[var(--chat-border)]',
        'bg-[var(--chat-surface-elevated)] p-3',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Preview thumbnail when available; falls back to a kind icon. */}
        {presentation.previewUri && !previewFailed ? (
          <div className="relative h-12 w-12 shrink-0">
            <img
              src={presentation.previewUri}
              alt={`${presentation.title} preview`}
              className="h-12 w-12 rounded-md object-cover"
              onError={() => {
                setPreviewFailed(true);
                onPreviewError?.();
              }}
            />
            {isVideo ? <VideoMarker overlay /> : null}
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--chat-surface-overlay)]">
            {isVideo ? <VideoMarker overlay={false} /> : getKindIcon(presentation.kindLabel)}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--chat-text-primary)]">
              {presentation.title}
            </span>
            <StatusBadge presentation={presentation} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--chat-text-muted)]">
            <span>{presentation.kindLabel}</span>
            {previewFailed ? <span>· Preview unavailable</span> : null}
            {presentation.byteCountLabel ? <span>· {presentation.byteCountLabel}</span> : null}
            {presentation.checksumShort ? (
              <span title="SHA-256 (first 12 hex chars)">· {presentation.checksumShort}</span>
            ) : null}
            {presentation.retentionLabel ? <span>· {presentation.retentionLabel}</span> : null}
          </div>
          {(presentation.privacyShortLabel ||
            presentation.providerLabel ||
            presentation.sourceSurfaceLabel) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {presentation.privacyShortLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-2 py-0.5 text-[10px] font-medium text-[var(--chat-text-secondary)]">
                  <Lock className="h-3 w-3" aria-hidden />
                  {presentation.privacyShortLabel}
                </span>
              ) : null}
              {presentation.providerLabel ? (
                <span className="inline-flex items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-2 py-0.5 text-[10px] font-medium text-[var(--chat-text-secondary)]">
                  {presentation.providerLabel}
                </span>
              ) : null}
              {presentation.sourceSurfaceLabel ? (
                <span className="inline-flex items-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-2 py-0.5 text-[10px] font-medium text-[var(--chat-text-secondary)]">
                  {presentation.sourceSurfaceLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {(downloadEnabled || shareEnabled || previewEnabled || onOpenSourceSession) && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-[var(--chat-border)] pt-2">
          {previewEnabled ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPreview}
              className="h-7 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
            >
              Preview
            </Button>
          ) : null}
          {downloadEnabled ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDownload}
              aria-label="Download generated file"
              className="h-7 gap-1.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          ) : null}
          {shareEnabled ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              aria-label="Share generated file"
              className="h-7 gap-1.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          ) : null}
          {onOpenSourceSession && presentation.sourceSessionLabel ? (
            <button
              type="button"
              onClick={onOpenSourceSession}
              className="ml-auto text-[11px] font-medium text-[var(--chat-text-muted)] underline-offset-2 hover:text-[var(--chat-text-secondary)] hover:underline"
            >
              {presentation.sourceSessionLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export type { GeneratedFileKind };
