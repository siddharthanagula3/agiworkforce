'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface DragDropOverlayProps {
  onDrop: (files: File[]) => void;
  accept?: string[];
  maxFiles?: number;
  className?: string;
}

export function DragDropOverlay({
  onDrop,
  accept,
  maxFiles = 10,
  className,
}: DragDropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setDragCounter((prev) => prev + 1);
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragCounter((prev) => {
        const next = prev - 1;
        if (next === 0) setIsDragging(false);
        return next;
      });
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setDragCounter(0);

      const files = Array.from(e.dataTransfer?.files || []);
      const filtered = accept
        ? files.filter((file) =>
            accept.some((type) => {
              if (type.endsWith('/*')) return file.type.startsWith(type.replace('/*', ''));
              return file.type === type || file.name.endsWith(type);
            }),
          )
        : files;

      if (filtered.length > 0) {
        onDrop(filtered.slice(0, maxFiles));
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
  }, [accept, maxFiles, onDrop]);

  // suppress unused warning
  void dragCounter;

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm',
            className,
          )}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-card/90 p-12 shadow-2xl"
          >
            {/* Corner accents */}
            <div className="absolute left-4 top-4 h-8 w-8 rounded-tl-xl border-l-2 border-t-2 border-primary" />
            <div className="absolute right-4 top-4 h-8 w-8 rounded-tr-xl border-r-2 border-t-2 border-primary" />
            <div className="absolute bottom-4 left-4 h-8 w-8 rounded-bl-xl border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-4 right-4 h-8 w-8 rounded-br-xl border-b-2 border-r-2 border-primary" />

            {/* Pulsing ring */}
            <motion.div
              className="absolute inset-0 rounded-3xl border-2 border-primary"
              animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Bouncing icon */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-6"
            >
              <Upload className="h-16 w-16 text-primary" />
            </motion.div>

            <div className="text-center">
              <h3 className="mb-1 text-xl font-semibold text-foreground">Drop files here</h3>
              <p className="text-sm text-muted-foreground">Release to attach to your message</p>
              {accept && accept.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground/60">
                  Accepted: {accept.join(', ')}
                </p>
              )}
              {maxFiles > 1 && (
                <p className="text-xs text-muted-foreground/60">Up to {maxFiles} files</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
