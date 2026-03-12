import { X, ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
}

export function ImageLightbox({ isOpen, onClose, src, alt }: ImageLightboxProps) {
  const prefersReducedMotion = useReducedMotion();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  // Define handlers first
  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case 'r':
          handleRotate();
          break;
        case '0':
          handleReset();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleRotate, handleReset]);

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = src;
    link.download = alt || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [src, alt]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.max(0.25, Math.min(4, prev + delta)));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      }
    },
    [scale, position],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/90 backdrop-blur-xs z-50"
          />

          {/* Lightbox Container */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/60 backdrop-blur-xs border border-white/10">
              <button type="button"
                onClick={handleZoomOut}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Zoom out (-)"
              >
                <ZoomOut className="h-4 w-4 text-white" />
              </button>
              <span className="px-2 text-xs text-white/80 font-medium min-w-[50px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button type="button"
                onClick={handleZoomIn}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Zoom in (+)"
              >
                <ZoomIn className="h-4 w-4 text-white" />
              </button>
              <div className="w-px h-4 bg-white/20 mx-1" />
              <button type="button"
                onClick={handleRotate}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Rotate (R)"
              >
                <RotateCw className="h-4 w-4 text-white" />
              </button>
              <button type="button"
                onClick={handleReset}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Reset (0)"
              >
                <Maximize2 className="h-4 w-4 text-white" />
              </button>
              <div className="w-px h-4 bg-white/20 mx-1" />
              <button type="button"
                onClick={handleDownload}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Download"
              >
                <Download className="h-4 w-4 text-white" />
              </button>
            </div>

            {/* Close button */}
            <button type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 hover:bg-white/10 rounded-full transition-colors"
              title="Close (Escape)"
            >
              <X className="h-6 w-6 text-white" />
            </button>

            {/* Image */}
            <motion.img
              ref={imageRef}
              src={src}
              alt={alt || 'Lightbox image'}
              initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.1 : 0.2 }}
              className={cn(
                'max-w-[90vw] max-h-[85vh] object-contain select-none',
                isDragging ? 'cursor-grabbing' : scale > 1 ? 'cursor-grab' : 'cursor-zoom-in',
              )}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                transition: isDragging || prefersReducedMotion ? 'none' : 'transform 0.2s ease',
              }}
              onMouseDown={handleMouseDown}
              onClick={(e) => {
                if (!isDragging && scale === 1) {
                  handleZoomIn();
                }
                e.stopPropagation();
              }}
              draggable={false}
            />

            {/* Image info */}
            {alt && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 backdrop-blur-xs border border-white/10">
                <p className="text-sm text-white/80">{alt}</p>
              </div>
            )}

            {/* Keyboard hints */}
            <div className="absolute bottom-4 right-4 text-[10px] text-white/40 space-y-0.5">
              <div>Scroll to zoom • Drag to pan</div>
              <div>R: Rotate • 0: Reset • Esc: Close</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ImageLightbox;
