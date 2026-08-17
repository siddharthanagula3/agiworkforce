'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bot,
  ChevronRight,
  CreditCard,
  DollarSign,
  MessageSquare,
  Monitor,
  Moon,
  PlusCircle,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { cn } from '@shared/utils/cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@agiworkforce/ui';
import { AVAILABLE_MODELS, useModelStore } from '@/shared/stores/model-store';
import type { AIModel } from '@/shared/stores/model-store';
import { normalizeModelId, requireProviderDefaultModel } from '@agiworkforce/types';

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: React.ElementType;
  hasSubMenu?: boolean;
  subCommands?: CommandOption[];
  action: () => void;
}

type ActiveSubMenu = 'model' | null;

const DEFAULT_COMMAND_PALETTE_MODEL = requireProviderDefaultModel('anthropic');

function useCommands(
  onOpenSubMenu: (menu: ActiveSubMenu) => void,
  currentModelId: string,
  setModelId: (id: string) => void,
): { top: CommandOption[]; modelCommands: CommandOption[] } {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  const preferences: CommandOption[] = [
    {
      id: 'toggle-theme',
      title: `Switch to ${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)} Theme`,
      subtitle: `Currently: ${themeLabel}`,
      group: 'Preferences',
      icon: ThemeIcon,
      action: () => setTheme(nextTheme),
    },
  ];

  // No command carries a keybinding hint: KEYBOARD_SHORTCUT_DOCS is the only
  // registry, and every binding in it is registered by the chat page, which is
  // the one route where CommandPaletteProvider refuses to open this palette.
  const top: CommandOption[] = [
    {
      id: 'new-chat',
      title: 'New Chat',
      subtitle: 'Start a fresh conversation',
      group: 'Actions',
      icon: PlusCircle,
      action: () => router.push('/chat'),
    },
    {
      id: 'search-conversations',
      title: 'Search Conversations',
      subtitle: 'Find past chats',
      group: 'Actions',
      icon: Search,
      action: () => router.push('/chat?search=true'),
    },
    {
      id: 'switch-model',
      title: 'Switch AI Model',
      subtitle: currentModelId,
      group: 'Actions',
      icon: Bot,
      hasSubMenu: true,
      action: () => onOpenSubMenu('model'),
    },

    {
      id: 'go-chat',
      title: 'Go to Chat',
      group: 'Navigate',
      icon: MessageSquare,
      action: () => router.push('/chat'),
    },
    {
      id: 'go-settings',
      title: 'Go to Settings',
      group: 'Navigate',
      icon: Settings,
      action: () => router.push('/settings/general'),
    },
    {
      id: 'go-billing',
      title: 'Go to Billing',
      group: 'Navigate',
      icon: CreditCard,
      action: () => router.push('/billing'),
    },
    {
      id: 'go-pricing',
      title: 'View Pricing',
      group: 'Navigate',
      icon: DollarSign,
      action: () => router.push('/pricing'),
    },

    ...preferences,
  ];

  const modelCommands: CommandOption[] = AVAILABLE_MODELS.map((model: AIModel) => ({
    id: `model-${model.id}`,
    title: model.name,
    subtitle: `${model.provider} · ${model.description}`,
    group: model.provider,
    icon: Bot,
    action: () => setModelId(model.id),
  }));

  return { top, modelCommands };
}

function groupCommands(commands: CommandOption[]): Record<string, CommandOption[]> {
  return commands.reduce<Record<string, CommandOption[]>>((acc, cmd) => {
    const list = acc[cmd.group] ?? [];
    list.push(cmd);
    acc[cmd.group] = list;
    return acc;
  }, {});
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSubMenu, setActiveSubMenu] = useState<ActiveSubMenu>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentModelId = useModelStore((state) => state.selectedModelId);
  const setSelectedModelId = useModelStore((state) => state.setSelectedModelId);

  const handleModelSwitch = useCallback(
    (modelId: string) => {
      const nextModelId = normalizeModelId(modelId) ?? modelId;
      setSelectedModelId(nextModelId);
    },
    [setSelectedModelId],
  );

  const { top: topCommands, modelCommands } = useCommands(
    setActiveSubMenu,
    currentModelId || DEFAULT_COMMAND_PALETTE_MODEL,
    (modelId) => {
      handleModelSwitch(modelId);
      onOpenChange(false);
    },
  );

  const activeCommands = activeSubMenu === 'model' ? modelCommands : topCommands;

  const filtered = useMemo(() => {
    if (!query.trim()) return activeCommands;
    const q = query.toLowerCase();
    return activeCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle?.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q),
    );
  }, [query, activeCommands]);

  const groups = useMemo(() => groupCommands(filtered), [filtered]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setActiveSubMenu(null);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeSubMenu]);

  const execute = useCallback(
    (cmd: CommandOption) => {
      if (cmd.hasSubMenu) {
        cmd.action();
        return;
      }
      onOpenChange(false);
      setActiveSubMenu(null);
      cmd.action();
    },
    [onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) execute(cmd);
      } else if (e.key === 'Escape') {
        if (activeSubMenu) {
          setActiveSubMenu(null);
          setQuery('');
        } else {
          onOpenChange(false);
        }
      }
    },
    [filtered, selectedIndex, execute, onOpenChange, activeSubMenu],
  );

  const subMenuTitle = activeSubMenu === 'model' ? 'Switch AI Model' : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden bg-popover text-popover-foreground border border-border shadow-2xl max-w-xl [&>button]:hidden">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search commands, navigate the app, change preferences, and switch AI models.
        </DialogDescription>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {activeSubMenu ? (
            <button
              onClick={() => {
                setActiveSubMenu(null);
                setQuery('');
              }}
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Back to main menu"
              type="button"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          )}
          {subMenuTitle && (
            <span className="text-xs font-medium text-muted-foreground shrink-0">
              {subMenuTitle}
            </span>
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeSubMenu === 'model' ? 'Filter models…' : 'Type a command or search…'}
            name="command-palette-search"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-sm bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Command palette search"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
              aria-label="Clear search"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-[10px] text-foreground bg-muted border border-border rounded px-1.5 py-0.5 hidden sm:block">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-[360px] overflow-y-auto py-2" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No commands found.</p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                {items.map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  const isSelected = idx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-accent/60',
                      )}
                      type="button"
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{cmd.title}</span>
                        {cmd.subtitle && (
                          <span className="ml-2 text-xs text-muted-foreground truncate">
                            {cmd.subtitle}
                          </span>
                        )}
                      </div>
                      {cmd.hasSubMenu && (
                        <ChevronRight
                          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/50 px-4 py-2">
          <div className="flex items-center gap-3 text-[10px] text-foreground">
            <span>
              <kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd>{' '}
              navigate
            </span>
            <span>
              <kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono">↵</kbd>{' '}
              select
            </span>
            <span>
              <kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono">esc</kbd>{' '}
              {activeSubMenu ? 'back' : 'close'}
            </span>
          </div>
          <span className="text-[10px] text-foreground">{filtered.length} results</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
