/**
 * KeyboardShortcutsDialog — Phase A Slice 5 (ported from UAC)
 *
 * Compact modal dialog listing keyboard shortcuts grouped by category.
 * Surface-agnostic: no Tauri or desktop-only imports.
 */
import { X, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { cn } from '../lib/utils';

export interface KeyboardShortcutsDialogProps {
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
              'rounded-2xl border border-[hsl(var(--border))]',
              'bg-[hsl(var(--card))] shadow-2xl',
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-[hsl(var(--accent))] rounded-lg transition-colors"
                aria-label="Close keyboard shortcuts dialog"
              >
                <X className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-3">
                    {group.title}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.description}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-sm text-[hsl(var(--foreground))]">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, idx) => (
                            <span key={idx}>
                              <kbd
                                className={cn(
                                  'px-2 py-1 text-xs font-medium rounded',
                                  'bg-[hsl(var(--muted))]',
                                  'border border-[hsl(var(--border))]',
                                  'text-[hsl(var(--foreground))]',
                                  'shadow-xs',
                                )}
                              >
                                {key}
                              </kbd>
                              {idx < shortcut.keys.length - 1 && (
                                <span className="mx-0.5 text-[hsl(var(--muted-foreground))]">
                                  +
                                </span>
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
            <div className="px-5 py-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
              <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-[hsl(var(--muted))] rounded border border-[hsl(var(--border))] text-[10px]">
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
