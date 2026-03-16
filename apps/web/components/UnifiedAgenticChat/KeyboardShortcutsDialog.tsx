import { X, Keyboard, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

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
    title: 'Navigation',
    shortcuts: [
      { keys: [metaKey, 'K'], description: 'Open command palette' },
      { keys: [metaKey, 'N'], description: 'New chat' },
      { keys: [metaKey, '/'], description: 'Show keyboard shortcuts' },
      { keys: [metaKey, 'B'], description: 'Toggle sidebar' },
      { keys: [metaKey, 'Shift', 'S'], description: 'Toggle sidebar (alternate)' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line in message' },
      { keys: ['Escape'], description: 'Stop streaming / close dialog' },
    ],
  },
  {
    title: 'Models',
    shortcuts: [{ keys: [metaKey, 'M'], description: 'Open model selector' }],
  },
  {
    title: 'Appearance',
    shortcuts: [
      { keys: [metaKey, 'D'], description: 'Toggle dark mode' },
      { keys: [metaKey, ','], description: 'Open settings' },
    ],
  },
  {
    title: 'Other',
    shortcuts: [
      { keys: [metaKey, 'Shift', 'O'], description: 'New conversation (alternate)' },
      { keys: [metaKey, 'F'], description: 'Search messages' },
    ],
  },
];

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Reset search when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setFocusedIndex(null);
    }
  }, [isOpen]);

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

  // Filter shortcuts based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return SHORTCUT_GROUPS;
    }

    const query = searchQuery.toLowerCase();
    return SHORTCUT_GROUPS.map((group) => ({
      ...group,
      shortcuts: group.shortcuts.filter((shortcut) => {
        const keyString = shortcut.keys.join(' ').toLowerCase();
        const description = shortcut.description.toLowerCase();
        return keyString.includes(query) || description.includes(query);
      }),
    })).filter((group) => group.shortcuts.length > 0);
  }, [searchQuery]);

  // Count total filtered shortcuts
  const totalShortcuts = filteredGroups.reduce((sum, group) => sum + group.shortcuts.length, 0);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, totalShortcuts - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev === null ? totalShortcuts - 1 : Math.max(prev - 1, 0)));
    }
  };

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
            data-testid="dialog-backdrop"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
              'w-full max-w-2xl max-h-[80vh] overflow-hidden',
              'rounded-2xl border border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-charcoal-900 shadow-2xl',
              'flex flex-col',
            )}
            role="dialog"
            aria-labelledby="shortcuts-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                <h2
                  id="shortcuts-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Search Input */}
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search shortcuts..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setFocusedIndex(null);
                  }}
                  onKeyDown={handleKeyDown}
                  className={cn(
                    'w-full pl-9 pr-4 py-2 text-sm',
                    'bg-gray-50 dark:bg-gray-800',
                    'border border-gray-200 dark:border-gray-700',
                    'rounded-lg',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    'text-gray-900 dark:text-gray-100',
                    'placeholder-gray-500 dark:placeholder-gray-400',
                  )}
                  autoFocus
                />
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-5">
              {totalShortcuts === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-sm text-gray-500 dark:text-gray-400">No shortcuts found</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredGroups.map((group) => (
                    <div key={group.title}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                        {group.title}
                      </h3>
                      <div className="space-y-2">
                        {group.shortcuts.map((shortcut) => (
                          <div
                            key={shortcut.description}
                            className={cn(
                              'flex items-center justify-between py-2 px-3 rounded-lg',
                              'transition-colors',
                              focusedIndex !== null
                                ? 'hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer'
                                : '',
                            )}
                            data-shortcut="true"
                            role="button"
                            tabIndex={0}
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
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
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
