'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from '@agiworkforce/icons';
import { MAX_CHAT_ATTACHMENT_COUNT } from '@agiworkforce/cloud-contracts';
import { cn } from '@shared/lib/utils';

interface DragDropOverlayProps {
  onDrop: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
}

export function DragDropOverlay({
  onDrop,
  maxFiles = MAX_CHAT_ATTACHMENT_COUNT,
  className,
}: DragDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        dragDepth.current += 1;
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragDepth.current = 0;

      const files = Array.from(e.dataTransfer?.files || []);
      // Every dropped file goes to the attachment hook, which owns the limit
      // and names what it refused; truncating here dropped the extras silently.
      if (files.length > 0) {
        onDrop(files);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onDrop]);

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm',
            className,
          )}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-card/90 p-12 shadow-e4"
          >
            <div className="absolute start-4 top-4 h-8 w-8 rounded-ss-xl border-s-2 border-t-2 border-primary" />
            <div className="absolute end-4 top-4 h-8 w-8 rounded-se-xl border-e-2 border-t-2 border-primary" />
            <div className="absolute bottom-4 start-4 h-8 w-8 rounded-es-xl border-b-2 border-s-2 border-primary" />
            <div className="absolute bottom-4 end-4 h-8 w-8 rounded-ee-xl border-b-2 border-e-2 border-primary" />

            <motion.div
              className="absolute inset-0 rounded-3xl border-2 border-primary"
              animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-6"
            >
              <Upload className="h-16 w-16 text-primary" />
            </motion.div>

            <div className="text-center">
              <h3 className="mb-1 text-h2 text-foreground">Drop files here</h3>
              <p className="text-sm text-muted-foreground">Release to attach to your message</p>
              {maxFiles > 1 && (
                <p className="text-xs text-muted-foreground">Up to {maxFiles} files</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
