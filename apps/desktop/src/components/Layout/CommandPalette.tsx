import { useMemo, useEffect, useState } from 'react';
import { Command } from 'cmdk';
import type { LucideIcon } from 'lucide-react';
import { Search, Clock, TrendingUp } from 'lucide-react';

import { Dialog, DialogContent } from '../ui/Dialog';
import { cn } from '../../lib/utils';
import {
  recordCommandExecution,
  getRecentCommandIds,
  getCommandStats,
  formatLastUsed,
} from '../../utils/commandHistory';

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  group?: string;
  shortcut?: string;
  icon?: LucideIcon;
  active?: boolean;
  action: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: CommandOption[];
}

export const CommandPalette = ({ open, onOpenChange, options }: CommandPaletteProps) => {
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);

  // Load recent commands on mount and when palette opens
  useEffect(() => {
    if (open) {
      const recent = getRecentCommandIds();
      setRecentCommandIds(recent);
    }
  }, [open]);

  // Separate recent commands from other options
  const { recentCommands, groupedOptions } = useMemo(() => {
    const recentSet = new Set(recentCommandIds);
    const recent: CommandOption[] = [];
    const remaining: CommandOption[] = [];

    // Separate recent vs non-recent
    for (const option of options) {
      if (recentSet.has(option.id)) {
        recent.push(option);
      } else {
        remaining.push(option);
      }
    }

    // Sort recent commands by recency
    recent.sort((a, b) => {
      const aIndex = recentCommandIds.indexOf(a.id);
      const bIndex = recentCommandIds.indexOf(b.id);
      return aIndex - bIndex;
    });

    // Group remaining options
    const groups = new Map<string, CommandOption[]>();
    for (const option of remaining) {
      const groupName = option.group || 'General';
      const existing = groups.get(groupName);
      if (existing) {
        existing.push(option);
      } else {
        groups.set(groupName, [option]);
      }
    }

    const grouped = Array.from(groups.entries()).map(([group, items]) => ({
      group,
      items,
    }));

    return { recentCommands: recent, groupedOptions: grouped };
  }, [options, recentCommandIds]);

  // Handle command execution with history tracking
  const handleCommandExecution = (item: CommandOption) => {
    // Record execution in history
    recordCommandExecution(item.id);

    // Execute the command
    Promise.resolve(item.action()).catch((error) => {
      console.error(`Command "${item.id}" failed`, error);
    });

    // Close palette
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden border border-border/60 bg-background text-foreground shadow-2xl max-w-xl [&>button]:hidden">
        <Command label="Command palette" className="w-full bg-background">
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Type a command or search"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Recent Commands Section */}
            {recentCommands.length > 0 && (
              <Command.Group
                heading={
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Recent</span>
                  </div>
                }
                className="px-2 py-2 space-y-1"
              >
                {recentCommands.map((item) => {
                  const stats = getCommandStats(item.id);
                  return (
                    <Command.Item
                      key={item.id}
                      value={item.title}
                      onSelect={() => handleCommandExecution(item)}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary data-[selected=true]:shadow-sm',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {item.icon && (
                          <item.icon
                            className={cn(
                              'h-4 w-4 text-muted-foreground flex-shrink-0',
                              item.active && 'text-primary',
                            )}
                          />
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={cn(item.active && 'font-semibold text-primary')}>
                            {item.title}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                            {stats.lastUsed && (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <Clock className="h-3 w-3" />
                                {formatLastUsed(stats.lastUsed)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {stats.executionCount > 1 && (
                          <span className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <TrendingUp className="h-3 w-3" />
                            {stats.executionCount}
                          </span>
                        )}
                        {item.shortcut && (
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {item.shortcut}
                          </span>
                        )}
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* All Other Commands */}
            {groupedOptions.map(({ group, items }) => (
              <Command.Group key={group} heading={group} className="px-2 py-2 space-y-1">
                {items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.title}
                    onSelect={() => handleCommandExecution(item)}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary data-[selected=true]:shadow-sm',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon && (
                        <item.icon
                          className={cn(
                            'h-4 w-4 text-muted-foreground',
                            item.active && 'text-primary',
                          )}
                        />
                      )}
                      <div className="flex flex-col">
                        <span className={cn(item.active && 'font-semibold text-primary')}>
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                        )}
                      </div>
                    </div>
                    {item.shortcut && (
                      <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {item.shortcut}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
