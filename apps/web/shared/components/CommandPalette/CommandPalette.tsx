'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bot,
  ChevronRight,
  CreditCard,
  DollarSign,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { ListChecks, MessageSquare, SquarePen } from '@agiworkforce/icons';
import { cn } from '@shared/utils/cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@agiworkforce/ui';
import { AVAILABLE_MODELS, useModelStore } from '@/shared/stores/model-store';
import type { AIModel } from '@/shared/stores/model-store';
import { normalizeModelId, requireProviderDefaultModel } from '@agiworkforce/types';
import { useChatStore, type Conversation } from '@shared/stores/web-chat-store';
import { formatRelativeTime } from '@shared/utils/format';
import { useIsWorkspaceAdmin } from '@shared/hooks/use-workspace-admin';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { buildAppNavItems } from '@shared/components/layout/app-nav-items';

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
const COMMAND_PALETTE_LISTBOX_ID = 'command-palette-listbox';
const RECENTS_LIMIT = 5;
const EMPTY_HIDDEN_NAV_IDS: string[] = [];
const optionElementId = (commandId: string): string => `command-palette-option-${commandId}`;

function recentConversationCommands(
  conversations: Conversation[],
  router: ReturnType<typeof useRouter>,
): CommandOption[] {
  return [...conversations]
    .filter((conversation) => !conversation.isArchived)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, RECENTS_LIMIT)
    .map((conversation) => ({
      id: `recent-${conversation.id}`,
      title: conversation.title || 'Untitled chat',
      subtitle: formatRelativeTime(conversation.updatedAt),
      group: 'Recents',
      icon: conversation.workMode === 'agiwork' ? ListChecks : MessageSquare,
      action: () => router.push(`/chat/${encodeURIComponent(conversation.id)}`),
    }));
}

function useCommands(
  onOpenSubMenu: (menu: ActiveSubMenu) => void,
  currentModelId: string,
  setModelId: (id: string) => void,
): { top: CommandOption[]; modelCommands: CommandOption[] } {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const conversations = useChatStore((state) => state.conversations);
  const isWorkspaceAdmin = useIsWorkspaceAdmin();
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds) ?? EMPTY_HIDDEN_NAV_IDS;

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

  // Quick actions match the leaders' shape: starting a fresh chat or task is
  // the first thing either palette offers, ahead of navigation.
  const quickActions: CommandOption[] = [
    {
      id: 'new-chat',
      title: 'New chat',
      group: 'Quick actions',
      icon: SquarePen,
      action: () => router.push('/chat'),
    },
    {
      id: 'new-task',
      title: 'New task',
      group: 'Quick actions',
      icon: ListChecks,
      action: () => router.push('/agi-work'),
    },
  ];

  const recents = recentConversationCommands(conversations, router);

  // The rail (`buildAppNavItems`) is the one place page destinations are
  // defined; reusing it here means this list can never drift the way the
  // hand-duplicated copy this replaced eventually did.
  const pageActions: CommandOption[] = buildAppNavItems({
    pathname: pathname ?? '/chat',
    navigate: (href) => router.push(href),
    isAdmin: isWorkspaceAdmin,
    hiddenIds: hiddenNavIds,
  }).map((item) => ({
    id: `nav-${item.id}`,
    title: item.label,
    group: 'Actions',
    icon: item.icon,
    action: item.onClick,
  }));

  const actions: CommandOption[] = [
    ...pageActions,
    {
      id: 'go-settings',
      title: 'Go to Settings',
      group: 'Actions',
      icon: Settings,
      action: () => router.push('/settings/general'),
    },
    {
      id: 'go-billing',
      title: 'Go to Billing',
      group: 'Actions',
      icon: CreditCard,
      action: () => router.push('/billing'),
    },
    {
      id: 'go-pricing',
      title: 'View Pricing',
      group: 'Actions',
      icon: DollarSign,
      action: () => router.push('/pricing'),
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
  ];

  // No command carries a keybinding hint: KEYBOARD_SHORTCUT_DOCS is the only
  // registry, and its bindings live on the chat page.
  const top: CommandOption[] = [...quickActions, ...recents, ...actions, ...preferences];

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
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSelectedIndex(filtered.length - 1);
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
            placeholder={activeSubMenu === 'model' ? 'Filter models…' : 'Search chats and actions'}
            name="command-palette-search"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            aria-label="Command palette search"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={COMMAND_PALETTE_LISTBOX_ID}
            aria-activedescendant={
              filtered[selectedIndex] ? optionElementId(filtered[selectedIndex].id) : undefined
            }
          />
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
            aria-label="Close"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Command list */}
        <div
          id={COMMAND_PALETTE_LISTBOX_ID}
          className="max-h-[360px] overflow-y-auto py-2"
          role="listbox"
          aria-label="Commands"
        >
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No commands found.</p>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 py-1.5 text-[12px] font-semibold text-muted-foreground">
                  {group}
                </p>
                {items.map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  const isSelected = idx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      id={optionElementId(cmd.id)}
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
      </DialogContent>
    </Dialog>
  );
}
