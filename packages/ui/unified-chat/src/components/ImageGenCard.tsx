import { Palette, Copy, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '@agiworkforce/ui';

export interface ImageGenCardProps {
  status: 'generating' | 'complete' | 'error';
  description: string;
  imageUrl?: string;
  onCopy?: () => void;
  onDownload?: () => void;
}

function SkeletonPlaceholder() {
  return (
    <div
      className={cn(
        'w-full aspect-video rounded-lg',
        'bg-[var(--chat-surface-hover)] animate-pulse',
      )}
      aria-label="Generating image…"
      role="status"
    />
  );
}

export function ImageGenCard({
  status,
  description,
  imageUrl,
  onCopy,
  onDownload,
}: ImageGenCardProps) {
  const headerText =
    status === 'generating'
      ? `Creating image · ${description}`
      : status === 'complete'
        ? `Image created · ${description}`
        : 'Image generation failed';

  return (
    <div className="my-2 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Palette
          size={15}
          className={cn(
            status === 'error'
              ? 'text-[var(--chat-destructive)]'
              : 'text-[var(--chat-accent-secondary)]',
          )}
        />
        <span
          className={cn(
            'text-sm',
            status === 'error'
              ? 'text-[var(--chat-destructive)]'
              : 'text-[var(--chat-text-secondary)]',
          )}
        >
          {headerText}
        </span>
      </div>

      {/* Body */}
      {status === 'generating' && <SkeletonPlaceholder />}

      {status === 'complete' && imageUrl && (
        <>
          <img
            src={imageUrl}
            alt={description}
            width={1024}
            height={576}
            className="w-full max-h-[400px] rounded-lg object-cover"
          />

          {/* Action row */}
          {(onCopy || onDownload) && (
            <div className="flex items-center gap-1">
              {onCopy && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy image"
                  onClick={onCopy}
                  className="h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
                >
                  <Copy size={13} aria-hidden="true" />
                </Button>
              )}
              {onDownload && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Download image"
                  onClick={onDownload}
                  className="h-8 w-8 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
                >
                  <Download size={13} aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {status === 'error' && (
        <p className="text-sm text-[var(--chat-destructive)]">
          Image generation failed. Please try again.
        </p>
      )}
    </div>
  );
}
