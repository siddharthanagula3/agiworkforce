'use client';

/**
 * ImageLightbox - Full-screen overlay for viewing images at full size
 *
 * - Dark backdrop with centered image
 * - Close with X button or Escape key
 * - Download button
 * - Zoom in / zoom out controls
 * - Prev/next across the other images in the same message
 *
 * A message can carry several images, and opening one used to be a dead end:
 * the only way to see the next was to close the overlay and click the next
 * thumbnail. Callers pass the whole set plus which one was clicked, so arrow
 * keys and the on-screen arrows move through them. Passing a single image is
 * still valid — the navigation chrome hides itself rather than rendering
 * disabled controls.
 */

import { useCallback, useEffect, useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LightboxImage {
  /** The image source URL */
  src: string;
  /** Alt text for the image */
  alt?: string;
  /** Optional filename used for the downloaded file */
  downloadFilename?: string;
}

interface ImageLightboxProps {
  /**
   * Every image in the set. Single-image callers pass one entry; the arrows
   * and the counter only appear when there is somewhere to go.
   */
  images: LightboxImage[];
  /** Which entry to open on. Out-of-range values clamp rather than blank out. */
  initialIndex?: number;
  /** Called when the lightbox should close */
  onClose: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 1;

// ─── Component ───────────────────────────────────────────────────────────────

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const count = images.length;
  // Clamp rather than trust the caller: an index past the end would render an
  // empty overlay with no way to tell it apart from a broken image.
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)),
  );

  const current = images[Math.min(index, Math.max(count - 1, 0))];
  const canNavigate = count > 1;

  // Moving to another image resets the zoom — carrying a 3x zoom across would
  // land the next image mid-crop with no indication why.
  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count); // wraps in both directions
      setZoom(DEFAULT_ZOOM);
    },
    [count],
  );

  // ── Keyboard handling ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && canNavigate) {
        setIndex((i) => (i - 1 + count) % count);
        setZoom(DEFAULT_ZOOM);
      } else if (e.key === 'ArrowRight' && canNavigate) {
        setIndex((i) => (i + 1) % count);
        setZoom(DEFAULT_ZOOM);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
      } else if (e.key === '0') {
        setZoom(DEFAULT_ZOOM);
      }
    },
    [onClose, canNavigate, count],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll while lightbox is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleKeyDown]);

  // ── Download handler ───────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!current) return;
    const link = document.createElement('a');
    link.href = current.src;
    link.download = current.downloadFilename || `image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [current]);

  // ── Backdrop click ─────────────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // Nothing to show. Rendering the chrome over a blank backdrop would look like
  // a failed load rather than an empty set.
  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Position in the set. Only meaningful with somewhere to go. */}
        {canNavigate && (
          <span
            className="mr-1 min-w-[3.5rem] text-center text-xs font-medium text-white/70"
            aria-live="polite"
          >
            {index + 1} of {count}
          </span>
        )}

        {/* Zoom out */}
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM))}
          disabled={zoom <= MIN_ZOOM}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-white/10 text-white hover:bg-white/20 transition-colors',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        {/* Zoom indicator */}
        <span className="min-w-[3rem] text-center text-xs font-medium text-white/70">
          {Math.round(zoom * 100)}%
        </span>

        {/* Zoom in */}
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM))}
          disabled={zoom >= MAX_ZOOM}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-white/10 text-white hover:bg-white/20 transition-colors',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        {/* Reset zoom */}
        <button
          type="button"
          onClick={() => setZoom(DEFAULT_ZOOM)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-white/10 text-white hover:bg-white/20 transition-colors',
          )}
          aria-label="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* Separator */}
        <div className="mx-1 h-5 w-px bg-white/20" />

        {/* Download */}
        <button
          type="button"
          onClick={handleDownload}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-white/10 text-white hover:bg-white/20 transition-colors',
          )}
          aria-label="Download image"
        >
          <Download className="h-4 w-4" />
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-white/10 text-white hover:bg-white/20 transition-colors',
          )}
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Previous / next. Rendered outside the image container so they stay put
          while the image scrolls under zoom. */}
      {canNavigate && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            className={cn(
              'absolute left-4 top-1/2 z-10 -translate-y-1/2',
              'flex h-11 w-11 items-center justify-center rounded-full',
              'bg-white/10 text-white hover:bg-white/20 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
            )}
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className={cn(
              'absolute right-4 top-1/2 z-10 -translate-y-1/2',
              'flex h-11 w-11 items-center justify-center rounded-full',
              'bg-white/10 text-white hover:bg-white/20 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
            )}
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Image container */}
      <div className="flex max-h-[90vh] max-w-[90vw] items-center justify-center overflow-auto">
        <img
          key={current.src}
          src={current.src}
          alt={current.alt ?? 'Image preview'}
          className="transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${zoom})`,
            maxWidth: '90vw',
            maxHeight: '85vh',
            objectFit: 'contain',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
