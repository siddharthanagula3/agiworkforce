'use client';

/**
 * MediaDisplay - Render generated images inline within chat messages
 *
 * - Max-width 512px, rounded-xl, shadow-sm
 * - Click to open lightbox
 * - Download button overlay on hover
 * - "Generating..." skeleton loading state
 */

import { useState, useCallback, memo } from 'react';
import { Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ImageLightbox } from './ImageLightbox';

// ─── Types ───────────────────────────────────────────────────────────────────

type MediaStatus = 'generating' | 'ready' | 'error';

interface MediaDisplayProps {
  /** Image source URL or base64 data URI */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Current generation status */
  status?: MediaStatus;
  /** Error message when status is 'error' */
  errorMessage?: string;
  /** Optional prompt text shown below the image */
  prompt?: string;
  /** Custom CSS classes */
  className?: string;
}

// ─── Skeleton / Generating State ─────────────────────────────────────────────

function GeneratingSkeleton({ prompt }: { prompt?: string }) {
  return (
    <div
      className={cn(
        'w-full max-w-[512px] rounded-xl border border-border/50',
        'bg-muted/30 overflow-hidden',
      )}
    >
      {/* Skeleton image area */}
      <div className="relative flex aspect-square max-h-[384px] items-center justify-center bg-muted/50">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="relative">
            <ImageIcon className="h-8 w-8 opacity-40" />
            <Loader2 className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin text-primary" />
          </div>
          <span className="text-sm font-medium">Generating...</span>
        </div>

        {/* Shimmer animation */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"
            style={{
              animationTimingFunction: 'ease-in-out',
            }}
          />
        </div>
      </div>

      {/* Optional prompt text */}
      {prompt && (
        <div className="border-t border-border/30 px-3 py-2">
          <p className="truncate text-xs text-muted-foreground">{prompt}</p>
        </div>
      )}
    </div>
  );
}

// ─── Error State ─────────────────────────────────────────────────────────────

function ErrorDisplay({ message }: { message?: string }) {
  return (
    <div
      className={cn(
        'flex w-full max-w-[512px] items-center gap-3 rounded-xl border border-destructive/30',
        'bg-destructive/5 p-4',
      )}
    >
      <ImageIcon className="h-5 w-5 flex-shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">Image generation failed</p>
        {message && <p className="mt-0.5 truncate text-xs text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function MediaDisplayComponent({
  src,
  alt = 'Generated image',
  status = 'ready',
  errorMessage,
  prompt,
  className,
}: MediaDisplayProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!src) return;
      const link = document.createElement('a');
      link.href = src;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [src],
  );

  // ── Generating state ────────────────────────────────────────────────────

  if (status === 'generating') {
    return <GeneratingSkeleton prompt={prompt} />;
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (status === 'error' || !src) {
    return <ErrorDisplay message={errorMessage} />;
  }

  // ── Ready state ─────────────────────────────────────────────────────────

  return (
    <>
      <div
        className={cn('group w-full max-w-[512px] cursor-pointer', className)}
        onClick={() => setLightboxOpen(true)}
        role="button"
        tabIndex={0}
        aria-label={`View ${alt} in full screen`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setLightboxOpen(true);
          }
        }}
      >
        <div className="relative overflow-hidden rounded-xl border border-border/50 shadow-sm">
          {/* Image */}
          <img
            src={src}
            alt={alt}
            className="w-full object-contain"
            style={{ maxHeight: '512px' }}
            draggable={false}
          />

          {/* Download overlay on hover */}
          <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              onClick={handleDownload}
              className={cn(
                'm-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5',
                'bg-white/90 text-sm font-medium text-gray-900',
                'shadow-sm hover:bg-white transition-colors',
              )}
              aria-label="Download image"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>

        {/* Optional prompt caption */}
        {prompt && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground" title={prompt}>
            {prompt}
          </p>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && <ImageLightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}

export const MediaDisplay = memo(MediaDisplayComponent);
MediaDisplay.displayName = 'MediaDisplay';
