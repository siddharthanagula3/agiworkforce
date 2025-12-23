import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  const [_dragCounter, setDragCounter] = useState(0);

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
        const newCount = prev - 1;
        if (newCount === 0) {
          setIsDragging(false);
        }
        return newCount;
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

      const filteredFiles = accept
        ? files.filter((file) =>
            accept.some((type) => {
              if (type.endsWith('/*')) {
                const baseType = type.replace('/*', '');
                return file.type.startsWith(baseType);
              }
              return file.type === type || file.name.endsWith(type);
            }),
          )
        : files;

      if (filteredFiles.length > 0) {
        onDrop(filteredFiles.slice(0, maxFiles));
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

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
            className,
          )}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative flex flex-col items-center justify-center p-12 bg-charcoal-800 rounded-3xl border-2 border-dashed border-terra-cotta shadow-2xl"
          >
            <motion.div
              animate={{
                y: [0, -10, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="mb-6"
            >
              <Upload className="w-20 h-20 text-terra-cotta" />
            </motion.div>

            <div className="text-center px-8">
              <h3 className="text-2xl font-semibold text-white mb-2">Drop to Add Context</h3>
              <p className="text-lg text-zinc-400 mb-4">Release to attach files to your message</p>
              {accept && accept.length > 0 && (
                <p className="text-sm text-zinc-500">Accepted: {accept.join(', ')}</p>
              )}
              {maxFiles > 0 && (
                <p className="text-sm text-zinc-500 mt-1">
                  Maximum {maxFiles} {maxFiles === 1 ? 'file' : 'files'}
                </p>
              )}
            </div>

            <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-terra-cotta rounded-tl-2xl" />
            <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-terra-cotta rounded-tr-2xl" />
            <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-terra-cotta rounded-bl-2xl" />
            <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-terra-cotta rounded-br-2xl" />

            <motion.div
              className="absolute inset-0 border-2 border-terra-cotta rounded-3xl"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.5, 0.2, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
