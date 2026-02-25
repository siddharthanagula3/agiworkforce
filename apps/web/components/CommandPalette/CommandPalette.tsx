'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  CreditCard,
  Image,
  DollarSign,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { useUIStore } from '@/stores/uiStore';

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  shortcut?: string;
  icon: React.ElementType;
  action: () => void;
}

function useCommands(): CommandOption[] {
  const router = useRouter();
  const { toggleSimpleMode, simpleMode } = useUIStore();

  return [
    {
      id: 'go-dashboard',
      title: 'Go to Dashboard',
      group: 'Navigate',
      icon: LayoutDashboard,
      shortcut: '⌘D',
      action: () => router.push('/dashboard'),
    },
    {
      id: 'go-chat',
      title: 'Go to Chat',
      group: 'Navigate',
      icon: MessageSquare,
      shortcut: '⌘⇧C',
      action: () => router.push('/chat'),
    },
    {
      id: 'go-settings',
      title: 'Go to Settings',
      group: 'Navigate',
      icon: Settings,
      action: () => router.push('/dashboard/settings'),
    },
    {
      id: 'go-billing',
      title: 'Go to Billing',
      group: 'Navigate',
      icon: CreditCard,
      action: () => router.push('/dashboard/billing'),
    },
    {
      id: 'go-media',
      title: 'Go to Media Generation',
      group: 'Navigate',
      icon: Image,
      action: () => router.push('/dashboard/media'),
    },
    {
      id: 'go-pricing',
      title: 'View Pricing',
      group: 'Navigate',
      icon: DollarSign,
      action: () => router.push('/pricing'),
    },
    {
      id: 'toggle-simple-mode',
      title: simpleMode ? 'Switch to Advanced Mode' : 'Switch to Simple Mode',
      subtitle: simpleMode ? 'Show full feature set' : 'Hide advanced options',
      group: 'Preferences',
      icon: Settings,
      action: toggleSimpleMode,
    },
  ];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useCommands();

  const filtered = query
    ? commands.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.subtitle?.toLowerCase().includes(query.toLowerCase()) ||
          c.group.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  // Group the filtered commands
  const groups = filtered.reduce<Record<string, CommandOption[]>>((acc, cmd) => {
    acc[cmd.group] = acc[cmd.group] || [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  // Flatten for keyboard nav
  const flatList = filtered;

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const execute = useCallback(
    (cmd: CommandOption) => {
      onOpenChange(false);
      cmd.action();
    },
    [onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = flatList[selectedIndex];
        if (cmd) execute(cmd);
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [flatList, selectedIndex, execute, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden bg-zinc-900 border border-zinc-700 shadow-2xl max-w-xl [&>button]:hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-zinc-200 placeholder:text-zinc-500 text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5 hidden sm:block">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {flatList.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-8">No commands found.</p>
          ) : (
            Object.entries(groups).map(([group, items]) => {
              return (
                <div key={group}>
                  <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                    {group}
                  </p>
                  {items.map((cmd) => {
                    const idx = flatList.indexOf(cmd);
                    const isSelected = idx === selectedIndex;
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => execute(cmd)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                          isSelected ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5',
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-zinc-500" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{cmd.title}</span>
                          {cmd.subtitle && (
                            <span className="ml-2 text-xs text-zinc-500">{cmd.subtitle}</span>
                          )}
                        </div>
                        {cmd.shortcut && (
                          <kbd className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
