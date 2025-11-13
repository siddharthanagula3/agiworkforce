import { X, File, FileText, FileImage, FileCode, FileJson, FileVideo } from 'lucide-react';
import { memo } from 'react';
import { cn } from '../../lib/utils';

interface FileAttachmentProps {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  onRemove: (id: string) => void;
  className?: string;
}

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Get appropriate icon for file type
const getFileIcon = (type: string, name: string) => {
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('text/')) return FileText;

  const ext = name.split('.').pop()?.toLowerCase();

  if (ext === 'json') return FileJson;
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h'].includes(ext || '')) {
    return FileCode;
  }
  if (['md', 'txt', 'csv'].includes(ext || '')) return FileText;

  return File;
};

function FileAttachmentComponent({
  id,
  name,
  size,
  type,
  previewUrl,
  onRemove,
  className,
}: FileAttachmentProps) {
  const Icon = getFileIcon(type, name);
  const isImage = type.startsWith('image/');

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border border-border/60 bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted',
        className,
      )}
    >
      {/* File icon or image preview */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-background shadow-sm">
        {isImage && previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            className="h-10 w-10 rounded-md object-cover"
          />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={name}>
          {name}
        </p>
        <p className="text-xs text-muted-foreground">
          {type || 'Unknown type'} • {formatFileSize(size)}
        </p>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="flex-shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label="Remove attachment"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export const FileAttachment = memo(FileAttachmentComponent, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.size === next.size &&
    prev.type === next.type &&
    prev.previewUrl === next.previewUrl &&
    prev.className === next.className
  );
});

FileAttachment.displayName = 'FileAttachment';
