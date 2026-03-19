'use client';

/**
 * DropZoneOverlay - Full-area overlay shown when files are dragged over the chat message list.
 *
 * Renders a semi-transparent backdrop with a dashed border, upload icon, and helper text.
 * Fades in/out via framer-motion AnimatePresence.
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from 'lucide-react';

interface DropZoneOverlayProps {
  /** Whether a drag is currently over the drop target */
  visible: boolean;
}

const DropZoneOverlayComponent = ({ visible }: DropZoneOverlayProps) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="drop-zone-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-teal-500/50 bg-teal-500/5 px-12 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10">
              <Upload className="h-6 w-6 text-teal-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Drop files to attach</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Images, documents, and code files
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const DropZoneOverlay = memo(DropZoneOverlayComponent);
DropZoneOverlay.displayName = 'DropZoneOverlay';
