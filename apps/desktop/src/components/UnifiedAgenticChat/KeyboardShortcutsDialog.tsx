import { X, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { cn } from '../../lib/utils';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const metaKey = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: [metaKey, 'K'], description: 'Open command palette' },
      { keys: [metaKey, 'Shift', 'S'], description: 'Toggle sidebar' },
      { keys: [metaKey, 'Shift', 'O'], description: 'New conversation' },
      { keys: [metaKey, 'Shift', 'T'], description: 'Toggle timestamps' },
      { keys: ['Escape'], description: 'Close dialogs / Cancel' },
      { keys: [metaKey, '/'], description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: [metaKey, 'Enter'], description: 'Send message' },
      { keys: [metaKey, 'F'], description: 'Search messages' },
      { keys: ['Alt', 'P'], description: 'Toggle model selector' },
      { keys: ['Shift', 'Enter'], description: 'New line in message' },
      { keys: ['J', '↓'], description: 'Next message' },
      { keys: ['K', '↑'], description: 'Previous message' },
    ],
  },
  {
    title: 'Code Editor',
    shortcuts: [
      { keys: [metaKey, 'S'], description: 'Save file' },
      { keys: [metaKey, 'Z'], description: 'Undo' },
      { keys: [metaKey, 'Shift', 'Z'], description: 'Redo' },
    ],
  },
];

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-full max-w-md max-h-[80vh] overflow-hidden',
              'rounded-2xl border border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-charcoal-900 shadow-2xl',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                    {group.title}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.description}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, idx) => (
                            <span key={idx}>
                              <kbd
                                className={cn(
                                  'px-2 py-1 text-xs font-medium rounded',
                                  'bg-gray-100 dark:bg-gray-800',
                                  'border border-gray-200 dark:border-gray-700',
                                  'text-gray-700 dark:text-gray-300',
                                  'shadow-xs',
                                )}
                              >
                                {key}
                              </kbd>
                              {idx < shortcut.keys.length - 1 && (
                                <span className="mx-0.5 text-gray-400">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-[10px]">
                  Escape
                </kbd>{' '}
                to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default KeyboardShortcutsDialog;
