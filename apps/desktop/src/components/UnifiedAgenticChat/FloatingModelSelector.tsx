import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import React, { useState } from 'react';
import { getModelMetadata } from '../../constants/llm';
import { cn } from '../../lib/utils';
import { useModelStore } from '../../stores/modelStore';
import { QuickModelSelector } from './QuickModelSelector';

export const FloatingModelSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedModel = useModelStore((state) => state.selectedModel);

  const modelDisplayName = selectedModel
    ? (getModelMetadata(selectedModel)?.name ?? 'Claude')
    : 'Claude';

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
      )}

      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-2.5',
            'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
            'shadow-lg hover:shadow-xl transition-all',
            'text-sm font-medium text-gray-900 dark:text-gray-100',
            isOpen && 'ring-2 ring-teal-500/20',
          )}
          aria-label="Select model"
          aria-expanded={isOpen}
        >
          <span className="truncate max-w-[150px]">{modelDisplayName}</span>
          <ChevronDown size={16} className={cn('transition-transform', isOpen && 'rotate-180')} />
        </button>

        {/* Dropdown Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full right-0 mb-2 w-[320px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-2xl"
            >
              <QuickModelSelector className="w-full max-w-none" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default FloatingModelSelector;
