'use client';

import { memo, useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
} from '@agiworkforce/icons';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@shared/lib/utils';
import type { AttachmentPreview as AttachmentPreviewData } from '@features/chat/hooks/use-attachments';
import type { ManagedCloudChatAttachmentUploadPhase } from '@agiworkforce/cloud-contracts';

export interface AttachmentUploadVisualStatus {
  phase: ManagedCloudChatAttachmentUploadPhase | 'ready';
  error?: string;
  retryable?: boolean;
}

interface AttachmentPreviewProps {
  previews: AttachmentPreviewData[];
  onRemove: (index: number) => void;
  statuses?: AttachmentUploadVisualStatus[];
  onRetry?: (index: number) => void;
  disableRemove?: boolean;
  numberImages?: boolean;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentKind {
  Icon: typeof FileIcon;
  label: string;
}

const PDF_KIND: DocumentKind = { Icon: FileText, label: 'PDF' };
const SPREADSHEET_KIND: DocumentKind = { Icon: FileSpreadsheet, label: 'Spreadsheet' };
const CODE_KIND: DocumentKind = { Icon: FileCode, label: 'Code' };
const DOCUMENT_KIND: DocumentKind = { Icon: FileText, label: 'Document' };
const TEXT_KIND: DocumentKind = { Icon: FileText, label: 'Text' };
const PRESENTATION_KIND: DocumentKind = { Icon: FileIcon, label: 'Presentation' };
const FILE_KIND: DocumentKind = { Icon: FileIcon, label: 'File' };

function documentKind(mimeType: string): DocumentKind {
  if (mimeType === 'application/pdf') return PDF_KIND;
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv' ||
    mimeType === 'text/tab-separated-values'
  ) {
    return SPREADSHEET_KIND;
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    mimeType.includes('xml')
  ) {
    return CODE_KIND;
  }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return PRESENTATION_KIND;
  }
  if (mimeType.includes('wordprocessing') || mimeType === 'application/msword') {
    return DOCUMENT_KIND;
  }
  if (mimeType.startsWith('text/')) return TEXT_KIND;
  return FILE_KIND;
}

const IMAGE_ORDER_PREFIX = 'Image ';
const DOCUMENT_CHIP_LIMIT = 4;
const SHOW_ALL_LABEL = 'Show all attachments';
const SHOW_FEWER_LABEL = 'Show fewer attachments';

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
        'absolute -end-1.5 -top-1.5 z-[var(--z-control)]',
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

function removeLabel(fileName: string, status?: AttachmentUploadVisualStatus): string {
  const inFlight =
    status?.phase === 'preparing' || status?.phase === 'uploading' || status?.phase === 'verifying';
  return inFlight ? `Cancel upload of ${fileName}` : `Remove ${fileName}`;
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
          {status.retryable === false && status.error ? status.error : 'Upload failed'}
        </span>
        {onRetry && status.retryable !== false ? (
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
  order,
  onRemove,
  status,
  onRetry,
  disableRemove,
}: {
  preview: AttachmentPreviewData;
  index: number;
  order?: number;
  onRemove: (index: number) => void;
  status?: AttachmentUploadVisualStatus;
  onRetry?: (index: number) => void;
  disableRemove?: boolean;
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
        label={removeLabel(preview.file.name, status)}
        disabled={disableRemove}
      />
      <div
        className="h-14 w-14 overflow-hidden rounded-lg border border-border/50 bg-muted/30"
        title={`${preview.file.name}, ${formatSize(preview.file.size)}`}
      >
        <img
          src={preview.url}
          alt={preview.file.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
      {order !== undefined && (
        <span
          data-testid="attachment-order"
          className="absolute bottom-1 start-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-background/90 px-1 text-caption font-semibold tabular-nums text-foreground shadow-e1"
        >
          <span className="sr-only">{IMAGE_ORDER_PREFIX}</span>
          {order}
        </span>
      )}
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
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
  status?: AttachmentUploadVisualStatus;
  onRetry?: (index: number) => void;
  disableRemove?: boolean;
}) {
  const { Icon, label: kindLabel } = documentKind(preview.file.type);
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
        label={removeLabel(name, status)}
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
            <span className="truncate text-caption text-muted-foreground">
              {`${kindLabel} · ${formatSize(preview.file.size)}`}
            </span>
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
  numberImages = false,
  className,
}: AttachmentPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  if (previews.length === 0) return null;
  const imageOrder = new Map<number, number>();
  if (numberImages) {
    previews.forEach((preview, index) => {
      if (preview.type === 'image') imageOrder.set(index, imageOrder.size + 1);
    });
  }

  const documentIndexes = previews.flatMap((preview, index) =>
    preview.type === 'image' ? [] : [index],
  );
  const collapsible = documentIndexes.length > DOCUMENT_CHIP_LIMIT;
  const overflowIndexes = new Set(documentIndexes.slice(DOCUMENT_CHIP_LIMIT));
  const overflowFailed = [...overflowIndexes].some(
    (index) => statuses?.[index]?.phase === 'failed',
  );
  const showingAll = !collapsible || expanded || overflowFailed;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 pb-2', className)}>
      <AnimatePresence mode="popLayout">
        {previews.map((preview, index) =>
          !showingAll && overflowIndexes.has(index) ? null : preview.type === 'image' ? (
            <ImageThumbnail
              key={preview.url}
              preview={preview}
              index={index}
              order={imageOrder.get(index)}
              onRemove={onRemove}
              status={statuses?.[index]}
              onRetry={onRetry}
              disableRemove={disableRemove}
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
            />
          ),
        )}
      </AnimatePresence>
      {collapsible && !overflowFailed && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {expanded ? SHOW_FEWER_LABEL : SHOW_ALL_LABEL}
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

export const AttachmentPreview = memo(AttachmentPreviewComponent);
AttachmentPreview.displayName = 'AttachmentPreview';
