'use client';

/**
 * ImageLightbox - Full-screen overlay for viewing images at full size
 *
 * - Dark backdrop with centered image
 * - Close with X button or Escape key
 * - Download button
 * - Zoom in / zoom out controls
 */

import { useCallback, useEffect, useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImageLightboxProps {
  /** The image source URL */
  src: string;
  /** Alt text for the image */
  alt?: string;
  /** Called when the lightbox should close */
  onClose: () => void;
  /** Optional filename used for the downloaded file */
  downloadFilename?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 1;

// ─── Component ───────────────────────────────────────────────────────────────

export function ImageLightbox({
  src,
  alt = 'Image preview',
  onClose,
  downloadFilename,
}: ImageLightboxProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  // ── Keyboard handling ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
      } else if (e.key === '0') {
        setZoom(DEFAULT_ZOOM);
      }
    },
    [onClose],
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
    const link = document.createElement('a');
    link.href = src;
    link.download = downloadFilename || `image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [src, downloadFilename]);

  // ── Backdrop click ─────────────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

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

      {/* Image container */}
      <div className="flex max-h-[90vh] max-w-[90vw] items-center justify-center overflow-auto">
        <img
          src={src}
          alt={alt}
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
