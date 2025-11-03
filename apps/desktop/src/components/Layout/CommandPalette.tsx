import { useMemo } from 'react';
import { Command } from 'cmdk';
import type { LucideIcon } from 'lucide-react';
import { Search } from 'lucide-react';

import { Dialog, DialogContent } from '../ui/Dialog';
import { cn } from '../../lib/utils';

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
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, CommandOption[]>();

    for (const option of options) {
      const groupName = option.group || 'General';
      const existing = groups.get(groupName);
      if (existing) {
        existing.push(option);
      } else {
        groups.set(groupName, [option]);
      }
    }

    return Array.from(groups.entries()).map(([group, items]) => ({
      group,
      items,
    }));
  }, [options]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden border border-border/60 bg-background text-foreground shadow-2xl max-w-xl [&>button]:hidden">
        <Command label="Command palette" className="w-full bg-background">
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Type a command or search…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {groupedOptions.map(({ group, items }) => (
              <Command.Group key={group} heading={group} className="px-2 py-2 space-y-1">
                {items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.title}
                    onSelect={() => {
                      Promise.resolve(item.action()).catch((error) => {
                        console.error(`Command "${item.id}" failed`, error);
                      });
                      onOpenChange(false);
                    }}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary data-[selected=true]:shadow-sm'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon && (
                        <item.icon
                          className={cn('h-4 w-4 text-muted-foreground', item.active && 'text-primary')}
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

