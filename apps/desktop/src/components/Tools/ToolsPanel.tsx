/**
 * ToolsPanel
 *
 * A grid of tool category cards. Clicking a card opens a slide-in
 * drawer with a ToolInvoker form for that category.
 *
 * Tool categories map 1-to-1 with the Rust backend tool executor
 * categories (file ops, web, bash, code, screenshot, browser, etc.).
 */
import { useState, useCallback } from 'react';
import { X, ChevronRight } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { TOOL_CATEGORIES, type ToolCategory } from './toolCategories';
import { ToolInvoker } from './ToolInvoker';
import { cn } from '@/lib/utils';

// Dynamic icon resolution from Lucide catalog
function getIcon(name: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
  return icons[name] ?? (icons['Wrench'] as LucideIcon);
}

interface ToolCardProps {
  tool: ToolCategory;
  onClick: (tool: ToolCategory) => void;
  isActive: boolean;
}

function ToolCard({ tool, onClick, isActive }: ToolCardProps) {
  const Icon = getIcon(tool.icon);
  return (
    <button
      type="button"
      onClick={() => onClick(tool)}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border p-4 text-left transition-all',
        'hover:border-primary/50 hover:shadow-sm hover:bg-accent/30',
        isActive
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
            'transition-colors',
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 transition-transform text-muted-foreground/50',
            isActive && 'rotate-90 text-primary',
          )}
        />
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{tool.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-snug line-clamp-2">
          {tool.description}
        </p>
      </div>
    </button>
  );
}

export function ToolsPanel() {
  const [activeTool, setActiveTool] = useState<ToolCategory | null>(null);

  const handleSelectTool = useCallback((tool: ToolCategory) => {
    setActiveTool((prev) => (prev?.id === tool.id ? null : tool));
  }, []);

  const handleClose = useCallback(() => {
    setActiveTool(null);
  }, []);

  const ActiveIcon = activeTool ? getIcon(activeTool.icon) : null;

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* Grid column */}
      <div
        className={cn(
          'flex flex-col min-h-0 transition-all duration-200',
          activeTool ? 'w-1/2 border-r border-border' : 'w-full',
        )}
      >
        <div className="px-1 pb-3 pt-0">
          <h3 className="text-lg font-semibold">Tools</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Directly invoke any agent tool without running a full chat session.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 gap-3 pr-1 pb-4">
            {TOOL_CATEGORIES.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onClick={handleSelectTool}
                isActive={activeTool?.id === tool.id}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel */}
      {activeTool && (
        <div className="flex flex-col w-1/2 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              {ActiveIcon && (
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ActiveIcon className="h-4 w-4" />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{activeTool.name}</p>
                <p className="text-xs text-muted-foreground">{activeTool.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close tool panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Invoker form */}
          <ScrollArea className="flex-1">
            <div className="px-5 py-4">
              <ToolInvoker tool={activeTool} />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
