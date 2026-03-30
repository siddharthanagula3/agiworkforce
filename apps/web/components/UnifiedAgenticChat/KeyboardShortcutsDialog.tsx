import { Keyboard, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = 'shortcuts-title';

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setFocusedIndex(null);
      return;
    }

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [isOpen, onClose]);

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

  const totalShortcuts = filteredGroups.reduce((sum, group) => sum + group.shortcuts.length, 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, totalShortcuts - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev === null ? totalShortcuts - 1 : Math.max(prev - 1, 0)));
    }
  };

  let shortcutIndex = -1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-labelledby={titleId}
        className="max-w-2xl p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
        overlayProps={{ 'data-testid': 'dialog-backdrop', onClick: onClose }}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="sr-only">Keyboard Shortcuts</DialogTitle>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight" id={titleId}>
            <Keyboard className="h-5 w-5 text-primary" />
            Keyboard Shortcuts
          </h2>
          <DialogDescription>Browse chat, model, and appearance shortcuts.</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/60 px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFocusedIndex(null);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'w-full rounded-xl border border-border/70 bg-muted/40 py-2 pl-9 pr-4 text-sm text-foreground outline-none transition-colors',
                'placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
              )}
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
          {totalShortcuts === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center">
              <p className="text-sm text-muted-foreground">No shortcuts found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut) => {
                      shortcutIndex += 1;
                      const isFocused = shortcutIndex === focusedIndex;

                      return (
                        <div
                          key={shortcut.description}
                          className={cn(
                            'flex items-center justify-between rounded-xl border border-transparent px-3 py-2 transition-colors',
                            isFocused ? 'border-primary/30 bg-primary/5' : 'hover:bg-muted/50',
                          )}
                        >
                          <span className="text-sm text-foreground">{shortcut.description}</span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, idx) => (
                              <span key={`${shortcut.description}-${key}-${idx}`}>
                                <kbd
                                  className={cn(
                                    'rounded-md border border-border/70 bg-muted/70 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm',
                                  )}
                                >
                                  {key}
                                </kbd>
                                {idx < shortcut.keys.length - 1 && (
                                  <span className="mx-0.5 text-muted-foreground">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="bg-muted/20 px-5 pb-4 pt-3">
          <p className="w-full text-center text-xs text-muted-foreground">
            Press{' '}
            <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5">
              Escape
            </kbd>{' '}
            to close
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
