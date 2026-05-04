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
  Image,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Search,
  Settings,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { AVAILABLE_MODELS } from '@/shared/stores/model-store';
import type { AIModel } from '@/shared/stores/model-store';
import { getProviderDefaultModel, normalizeModelId } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  shortcut?: string;
  icon: React.ElementType;
  /** When true, clicking opens a sub-list instead of closing the palette */
  hasSubMenu?: boolean;
  /** Sub-commands rendered when this option is "expanded" */
  subCommands?: CommandOption[];
  action: () => void;
}

type ActiveSubMenu = 'model' | null;

const DEFAULT_COMMAND_PALETTE_MODEL = getProviderDefaultModel('anthropic') ?? 'claude-sonnet-4.6';

// ---------------------------------------------------------------------------
// Hook: build the full command list
// ---------------------------------------------------------------------------

function useCommands(
  onOpenSubMenu: (menu: ActiveSubMenu) => void,
  currentModelId: string,
  setModelId: (id: string) => void,
): { top: CommandOption[]; modelCommands: CommandOption[] } {
  const router = useRouter();
  const { toggleSimpleMode, simpleMode } = useUIStore();
  const { sidebarCollapsed, toggleSidebar } = useChatStore();
  const { theme, setTheme } = useTheme();

  const mod =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';

  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  const top: CommandOption[] = [
    // ---------- Actions ----------
    {
      id: 'new-chat',
      title: 'New Chat',
      subtitle: 'Start a fresh conversation',
      group: 'Actions',
      icon: PlusCircle,
      shortcut: `${mod}⇧O`,
      action: () => router.push('/chat'),
    },
    {
      id: 'search-conversations',
      title: 'Search Conversations',
      subtitle: 'Find past chats',
      group: 'Actions',
      icon: Search,
      shortcut: `${mod}F`,
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

    // ---------- Navigate ----------
    {
      id: 'go-chat',
      title: 'Go to Chat',
      group: 'Navigate',
      icon: LayoutDashboard,
      shortcut: `${mod}D`,
      action: () => router.push('/chat'),
    },
    {
      id: 'go-chat',
      title: 'Go to Chat',
      group: 'Navigate',
      icon: MessageSquare,
      shortcut: `${mod}⇧C`,
      action: () => router.push('/chat'),
    },
    {
      id: 'go-settings',
      title: 'Go to Settings',
      group: 'Navigate',
      icon: Settings,
      action: () => router.push('/chat'),
    },
    {
      id: 'go-billing',
      title: 'Go to Billing',
      group: 'Navigate',
      icon: CreditCard,
      action: () => router.push('/billing'),
    },
    {
      id: 'go-media',
      title: 'Go to Media Generation',
      group: 'Navigate',
      icon: Image,
      action: () => router.push('/chat'),
    },
    {
      id: 'go-pricing',
      title: 'View Pricing',
      group: 'Navigate',
      icon: DollarSign,
      action: () => router.push('/pricing'),
    },

    // ---------- Preferences ----------
    {
      id: 'toggle-sidebar',
      title: sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar',
      subtitle: 'Toggle conversation list',
      group: 'Preferences',
      icon: sidebarCollapsed ? PanelLeftOpen : PanelLeftClose,
      shortcut: `${mod}⇧S`,
      action: toggleSidebar,
    },
    {
      id: 'toggle-theme',
      title: `Switch to ${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)} Theme`,
      subtitle: `Currently: ${themeLabel}`,
      group: 'Preferences',
      icon: ThemeIcon,
      action: () => setTheme(nextTheme),
    },
    {
      id: 'toggle-simple-mode',
      title: simpleMode ? 'Switch to Advanced Mode' : 'Switch to Simple Mode',
      subtitle: simpleMode ? 'Show full feature set' : 'Hide advanced options',
      group: 'Preferences',
      icon: Zap,
      action: toggleSimpleMode,
    },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupCommands(commands: CommandOption[]): Record<string, CommandOption[]> {
  return commands.reduce<Record<string, CommandOption[]>>((acc, cmd) => {
    const list = acc[cmd.group] ?? [];
    list.push(cmd);
    acc[cmd.group] = list;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSubMenu, setActiveSubMenu] = useState<ActiveSubMenu>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Model state - sourced from shared model store via a lightweight selector
  const [currentModelId, setCurrentModelId] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_COMMAND_PALETTE_MODEL;
    try {
      const raw = localStorage.getItem('agi-model-store');
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { selectedModelId?: string } };
        return normalizeModelId(parsed?.state?.selectedModelId) ?? DEFAULT_COMMAND_PALETTE_MODEL;
      }
    } catch {
      // ignore
    }
    return DEFAULT_COMMAND_PALETTE_MODEL;
  });

  const handleModelSwitch = useCallback((modelId: string) => {
    const nextModelId = normalizeModelId(modelId) ?? modelId;
    setCurrentModelId(nextModelId);
    // Persist to shared model store via localStorage directly
    try {
      const raw = localStorage.getItem('agi-model-store');
      const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const updated = {
        ...existing,
        state: { ...(existing['state'] as Record<string, unknown>), selectedModelId: nextModelId },
      };
      localStorage.setItem('agi-model-store', JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, []);

  const { top: topCommands, modelCommands } = useCommands(
    setActiveSubMenu,
    currentModelId,
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

  // Reset on open/query change
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
        cmd.action(); // triggers setActiveSubMenu
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
      <DialogContent className="p-0 overflow-hidden bg-zinc-900 border border-zinc-700 shadow-2xl max-w-xl [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          {activeSubMenu ? (
            <button
              onClick={() => {
                setActiveSubMenu(null);
                setQuery('');
              }}
              className="text-zinc-500 hover:text-zinc-300 shrink-0"
              aria-label="Back to main menu"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
          )}
          {subMenuTitle && (
            <span className="text-xs font-medium text-zinc-400 shrink-0">{subMenuTitle}</span>
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeSubMenu === 'model' ? 'Filter models...' : 'Type a command or search...'
            }
            className="flex-1 bg-transparent text-zinc-200 placeholder:text-zinc-500 text-sm outline-none"
            aria-label="Command palette search"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-zinc-500 hover:text-zinc-300 shrink-0"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5 hidden sm:block">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-[360px] overflow-y-auto py-2" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-8">No commands found.</p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
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
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                        isSelected ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5',
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-zinc-500" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{cmd.title}</span>
                        {cmd.subtitle && (
                          <span className="ml-2 text-xs text-zinc-500 truncate">
                            {cmd.subtitle}
                          </span>
                        )}
                      </div>
                      {cmd.hasSubMenu && (
                        <ChevronRight
                          className="w-3.5 h-3.5 text-zinc-600 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {cmd.shortcut && !cmd.hasSubMenu && (
                        <kbd className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5 shrink-0">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950/50 px-4 py-2">
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span>
              <kbd className="bg-zinc-800 rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-zinc-800 rounded px-1 py-0.5 font-mono">↵</kbd> select
            </span>
            <span>
              <kbd className="bg-zinc-800 rounded px-1 py-0.5 font-mono">esc</kbd>{' '}
              {activeSubMenu ? 'back' : 'close'}
            </span>
          </div>
          <span className="text-[10px] text-zinc-600">{filtered.length} results</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
