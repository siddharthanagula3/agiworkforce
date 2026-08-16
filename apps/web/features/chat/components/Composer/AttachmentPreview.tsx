'use client';

import { memo } from 'react';
import { X, FileText, FileSpreadsheet, FileCode, File as FileIcon, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@shared/lib/utils';
import type { AttachmentPreview as AttachmentPreviewData } from '@features/chat/hooks/use-attachments';

interface AttachmentPreviewProps {
  previews: AttachmentPreviewData[];
  onRemove: (index: number) => void;
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

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'absolute -right-1.5 -top-1.5 z-10',
        'flex h-5 w-5 items-center justify-center rounded-full',
        'bg-background/90 border border-border shadow-sm',
        'text-muted-foreground hover:text-foreground hover:bg-muted',
        'transition-colors duration-100',
      )}
      aria-label={label}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function PrivacyChip({ label }: { label: string }) {
  return (
    <div
      className="absolute -bottom-1 left-1 z-10 flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm"
      aria-label={`Outbound destination: ${label}`}
    >
      <Lock className="h-2.5 w-2.5" />
      {label}
    </div>
  );
}

function ImageThumbnail({
  preview,
  index,
  onRemove,
  privacyShortLabel,
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
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
      <RemoveButton onClick={() => onRemove(index)} label={`Remove ${preview.file.name}`} />
      {privacyShortLabel ? <PrivacyChip label={privacyShortLabel} /> : null}
      <div className="h-14 w-14 overflow-hidden rounded-lg border border-border/50 bg-muted/30">
        <img
          src={preview.url}
          alt={preview.file.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    </motion.div>
  );
}

function DocumentChip({
  preview,
  index,
  onRemove,
  privacyShortLabel,
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
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
      <RemoveButton onClick={() => onRemove(index)} label={`Remove ${name}`} />
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
            <span className="text-[10px] text-muted-foreground">
              {formatSize(preview.file.size)}
            </span>
            {privacyShortLabel ? (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                aria-label={`Outbound destination: ${privacyShortLabel}`}
              >
                <Lock className="h-2.5 w-2.5" />
                {privacyShortLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AttachmentPreviewComponent({
  previews,
  onRemove,
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
              key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`}
              preview={preview}
              index={index}
              onRemove={onRemove}
              privacyShortLabel={privacyShortLabel}
            />
          ) : (
            <DocumentChip
              key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`}
              preview={preview}
              index={index}
              onRemove={onRemove}
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
