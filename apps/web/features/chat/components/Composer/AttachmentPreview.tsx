'use client';

/**
 * AttachmentPreview - Horizontal row of file thumbnails above the textarea
 *
 * - Images: 56x56 rounded thumbnail with X remove button
 * - Documents: file icon + name + size + X remove button
 * - Animate in/out with framer-motion
 */

import { memo } from 'react';
import { X, FileText, FileSpreadsheet, FileCode, File as FileIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@shared/lib/utils';
import type { AttachmentPreview as AttachmentPreviewData } from '@features/chat/hooks/use-attachments';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttachmentPreviewProps {
  previews: AttachmentPreviewData[];
  onRemove: (index: number) => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Animation variants ──────────────────────────────────────────────────────

const itemVariants = {
  initial: { opacity: 0, scale: 0.8, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.8, y: 8 },
};

// ─── Remove Button ───────────────────────────────────────────────────────────

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

// ─── Image Thumbnail ─────────────────────────────────────────────────────────

function ImageThumbnail({
  preview,
  index,
  onRemove,
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
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

// ─── Document Chip ───────────────────────────────────────────────────────────

function DocumentChip({
  preview,
  index,
  onRemove,
}: {
  preview: AttachmentPreviewData;
  index: number;
  onRemove: (index: number) => void;
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
          <div className="text-[10px] text-muted-foreground">{formatSize(preview.file.size)}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function AttachmentPreviewComponent({ previews, onRemove, className }: AttachmentPreviewProps) {
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
            />
          ) : (
            <DocumentChip
              key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`}
              preview={preview}
              index={index}
              onRemove={onRemove}
            />
          ),
        )}
      </AnimatePresence>
    </div>
  );
}

export const AttachmentPreview = memo(AttachmentPreviewComponent);
AttachmentPreview.displayName = 'AttachmentPreview';
