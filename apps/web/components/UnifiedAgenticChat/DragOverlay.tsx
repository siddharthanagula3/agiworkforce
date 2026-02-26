/**
 * DragOverlay Component
 *
 * Full-screen overlay shown when dragging files over the app.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Paperclip } from 'lucide-react';

export interface DragOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ isVisible }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
        >
          <div className="flex h-full items-center justify-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-3xl bg-linear-to-r from-amber-500 via-orange-500 to-amber-500"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  style={{ padding: '3px' }}
                />
                <div className="relative rounded-3xl bg-zinc-900 p-10">
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Paperclip className="h-16 w-16 text-primary" />
                  </motion.div>
                </div>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-white mb-2">Drop files here</p>
                <p className="text-sm text-zinc-400">Images, documents, and more</p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DragOverlay;
