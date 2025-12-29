/**
 * InlinePanel Component
 *
 * Base container component for inline panels that display command outputs
 * (terminal, browser, code, database) directly within chat messages.
 */

import React, { memo } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../../lib/utils';
import { InlinePanel as InlinePanelType } from '../../../stores/unifiedChatStore';

export interface InlinePanelProps {
  panel: InlinePanelType;
  onToggleCollapse: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}

const InlinePanelComponent: React.FC<InlinePanelProps> = memo(
  ({ panel, onToggleCollapse, onClose, children }) => {
    const getIcon = (type: InlinePanelType['type']) => {
      const icons: Record<InlinePanelType['type'], string> = {
        terminal: '⌨️',
        browser: '🌐',
        code: '💻',
        database: '🗄️',
      };
      return icons[type];
    };

    const getTitle = (type: InlinePanelType['type']) => {
      const titles: Record<InlinePanelType['type'], string> = {
        terminal: 'Terminal Output',
        browser: 'Browser',
        code: 'Code',
        database: 'Query Results',
      };
      return titles[type];
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="my-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-charcoal-800 overflow-hidden"
      >
        {/* Header */}
        <div
          onClick={onToggleCollapse}
          className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-charcoal-700 hover:bg-gray-150 dark:hover:bg-charcoal-650 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-lg flex-shrink-0">{getIcon(panel.type)}</span>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {getTitle(panel.type)}
            </span>
            {panel.metadata &&
              'duration' in panel.metadata &&
              panel.metadata['duration'] != null && (
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto flex-shrink-0">
                  {String(panel.metadata['duration'])}ms
                </span>
              )}
            {panel.metadata && 'status' in panel.metadata && panel.metadata['status'] != null && (
              <span
                className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded flex-shrink-0',
                  String(panel.metadata['status']) === 'success'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : String(panel.metadata['status']) === 'error'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                )}
              >
                {String(panel.metadata['status'])}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-charcoal-600 rounded transition-colors"
              title={panel.isCollapsed ? 'Expand' : 'Collapse'}
              aria-label={panel.isCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <ChevronDown
                size={16}
                className={cn(
                  'text-gray-600 dark:text-gray-400 transition-transform',
                  panel.isCollapsed && '-rotate-90',
                )}
              />
            </button>
            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-charcoal-600 rounded transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                title="Close panel"
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <AnimatePresence>
          {!panel.isCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  },
);

InlinePanelComponent.displayName = 'InlinePanel';

export { InlinePanelComponent as InlinePanel };
