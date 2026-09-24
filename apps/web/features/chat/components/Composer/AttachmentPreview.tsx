'use client';

import { memo } from 'react';
import {
  X,
  FileText,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
  Lock,
} from '@agiworkforce/icons';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@shared/lib/utils';
import type { AttachmentPreview as AttachmentPreviewData } from '@features/chat/hooks/use-attachments';
import type { ManagedCloudChatAttachmentUploadPhase } from '@agiworkforce/cloud-contracts';

export interface AttachmentUploadVisualStatus {
  phase: ManagedCloudChatAttachmentUploadPhase | 'ready';
  error?: string;
}

interface AttachmentPreviewProps {
  previews: AttachmentPreviewData[];
  onRemove: (index: number) => void;
  statuses?: AttachmentUploadVisualStatus[];
  onRetry?: (index: number) => void;
  disableRemove?: boolean;
  className?: string;
  privacyShortLabel?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    mimeType.includes('xml')
  ) {
    return FileCode;
  }
  return FileIcon;
}

const itemVariants = {
  initial: { opacity: 0, scale: 0.8, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.8, y: 8 },
};

function RemoveButton({
  onClick,
  label,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'absolute -right-1.5 -top-1.5 z-[var(--z-control)]',
        // 20px was under the 24px target minimum this repository already
        // states. The dot stays small because it sits on the corner of a
        // thumbnail; the pseudo-element gives the finger a 40px target without
        // changing what is drawn or how the row lays out.
        'flex h-6 w-6 items-center justify-center rounded-full',
        "before:absolute before:-inset-2 before:content-['']",
        'bg-background/90 border border-border shadow-e1',
        'text-muted-foreground hover:text-foreground hover:bg-muted',
        'transition-colors duration-instant',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      aria-label={label}
      disabled={disabled}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function PrivacyChip({ label }: { label: string }) {
  return (
    <div
      className="absolute -bottom-1 left-1 z-[var(--z-control)] flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1.5 py-0.5 text-caption font-semibold uppercase tracking-wide text-foreground shadow-e1"
      aria-label={`Outbound destination: ${label}`}
    >
      <Lock className="h-4 w-4" />
      {label}
    </div>
  );
}

function UploadStatus({
  fileName,
  status,
  onRetry,
}: {
  fileName: string;
  status?: AttachmentUploadVisualStatus;
  onRetry?: () => void;
}) {
  if (!status || status.phase === 'ready' || status.phase === 'complete') return null;
  if (status.phase === 'failed') {
    return (
      <div className="mt-1 flex min-w-0 items-center gap-1" role="alert">
        <span className="truncate text-caption text-destructive" title={status.error}>
          Upload failed
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
            className="shrink-0 rounded-sm text-caption font-semibold text-primary underline underline-offset-2"
            aria-label={`Retry upload for ${fileName}`}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  const label =
    status.phase === 'verifying'
      ? 'Verifying…'
      : status.phase === 'uploading'
        ? 'Uploading…'
        : 'Preparing…';
  return (
    <div
      className="mt-1 truncate text-caption text-muted-foreground"
      role="progressbar"
      aria-label={`${label.replace('…', '')} ${fileName}`}
      aria-valuetext={label}
    >
      {label}
    </div>
  );
}

function ImageThumbnail({
  preview,
  index,
  onRemove,
  status,
  onRetry,
  disableRemove,
  privacyShortLabel,
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
  status?: AttachmentUploadVisualStatus;
  onRetry?: (index: number) => void;
  disableRemove?: boolean;
  privacyShortLabel?: string;
}) {
  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="relative flex-shrink-0"
    >
      <RemoveButton
        onClick={() => onRemove(index)}
        label={`Remove ${preview.file.name}`}
        disabled={disableRemove}
      />
      {privacyShortLabel ? <PrivacyChip label={privacyShortLabel} /> : null}
      <div className="h-14 w-14 overflow-hidden rounded-lg border border-border/50 bg-muted/30">
        <img
          src={preview.url}
          alt={preview.file.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
      <UploadStatus
        fileName={preview.file.name}
        status={status}
        onRetry={onRetry ? () => onRetry(index) : undefined}
      />
    </motion.div>
  );
}

function DocumentChip({
  preview,
  index,
  onRemove,
  status,
  onRetry,
  disableRemove,
  privacyShortLabel,
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
  status?: AttachmentUploadVisualStatus;
  onRetry?: (index: number) => void;
  disableRemove?: boolean;
  privacyShortLabel?: string;
}) {
  const Icon = getDocIcon(preview.file.type);
  const name = preview.file.name;
  const displayName = name.length > 20 ? name.slice(0, 17) + '...' : name;

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="relative flex-shrink-0"
    >
      <RemoveButton
        onClick={() => onRemove(index)}
        label={`Remove ${name}`}
        disabled={disableRemove}
      />
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2',
          'max-w-[180px]',
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground" title={name}>
            {displayName}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-caption text-muted-foreground">
              {formatSize(preview.file.size)}
            </span>
            {privacyShortLabel ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-border/60 px-1.5 py-0.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground"
                aria-label={`Outbound destination: ${privacyShortLabel}`}
              >
                <Lock className="h-4 w-4" />
                {privacyShortLabel}
              </span>
            ) : null}
          </div>
          <UploadStatus
            fileName={name}
            status={status}
            onRetry={onRetry ? () => onRetry(index) : undefined}
          />
        </div>
      </div>
    </motion.div>
  );
}

function AttachmentPreviewComponent({
  previews,
  onRemove,
  statuses,
  onRetry,
  disableRemove,
  className,
  privacyShortLabel,
}: AttachmentPreviewProps) {
  if (previews.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 pb-2', className)}>
      <AnimatePresence mode="popLayout">
        {previews.map((preview, index) =>
          preview.type === 'image' ? (
            <ImageThumbnail
              key={preview.url}
              preview={preview}
              index={index}
              onRemove={onRemove}
              status={statuses?.[index]}
              onRetry={onRetry}
              disableRemove={disableRemove}
              privacyShortLabel={privacyShortLabel}
            />
          ) : (
            <DocumentChip
              key={preview.url}
              preview={preview}
              index={index}
              onRemove={onRemove}
              status={statuses?.[index]}
              onRetry={onRetry}
              disableRemove={disableRemove}
              privacyShortLabel={privacyShortLabel}
            />
          ),
        )}
      </AnimatePresence>
    </div>
  );
}

export const AttachmentPreview = memo(AttachmentPreviewComponent);
AttachmentPreview.displayName = 'AttachmentPreview';
