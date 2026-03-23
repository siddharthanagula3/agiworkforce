import { useState } from 'react';
import { Palette, Copy, Download, MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';

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
      aria-label="Generating image..."
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
  const [moreOpen, setMoreOpen] = useState(false);

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
            className="w-full max-h-[400px] rounded-lg object-cover"
          />

          {/* Action row */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy image"
              onClick={onCopy}
              className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              <Copy size={13} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Download image"
              onClick={onDownload}
              className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              <Download size={13} />
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="More options"
                onClick={() => setMoreOpen((prev) => !prev)}
                className="h-7 w-7 text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
              >
                <MoreHorizontal size={13} />
              </Button>

              {moreOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMoreOpen(false)}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      'absolute left-0 top-full mt-1 z-20 min-w-[140px]',
                      'rounded-[var(--chat-radius-md)] border border-[var(--chat-border)]',
                      'bg-[var(--chat-surface-elevated)] shadow-lg py-1',
                    )}
                  >
                    <button
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-sm',
                        'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
                        'transition-colors',
                      )}
                      onClick={() => {
                        onDownload?.();
                        setMoreOpen(false);
                      }}
                    >
                      <Download size={13} />
                      Save as...
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
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
