'use client';

import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Globe, Brain, Image, FileText, Code } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

const COMMANDS: SlashCommand[] = [
  { id: 'search', label: '/search', description: 'Search the web', icon: Globe },
  { id: 'think', label: '/think', description: 'Extended reasoning', icon: Brain },
  { id: 'image', label: '/image', description: 'Generate an image', icon: Image },
  { id: 'doc', label: '/doc', description: 'Create a document', icon: FileText },
  { id: 'code', label: '/code', description: 'Write or explain code', icon: Code },
];

export interface SlashCommandMenuHandle {
  /** Handle a keyboard key. Returns true if the event was consumed. */
  handleKey: (key: string) => boolean;
}

interface SlashCommandMenuProps {
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ query, onSelect, onClose }, ref) {
    const filtered = COMMANDS.filter(
      (cmd) =>
        query === '' ||
        cmd.id.startsWith(query.toLowerCase()) ||
        cmd.label.slice(1).startsWith(query.toLowerCase()),
    );

    const [activeIndex, setActiveIndex] = useState(0);

    // Reset active index when query changes
    const prevQueryRef = React.useRef(query);
    React.useEffect(() => {
      if (prevQueryRef.current !== query) {
        prevQueryRef.current = query;
        if (activeIndex !== 0) setActiveIndex(0);
      }
    }, [query, activeIndex]);

    const handleSelect = useCallback(
      (id: string) => {
        onSelect(id);
        onClose();
      },
      [onSelect, onClose],
    );

    useImperativeHandle(
      ref,
      () => ({
        handleKey(key: string): boolean {
          if (filtered.length === 0) return false;

          if (key === 'ArrowUp') {
            setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
            return true;
          }
          if (key === 'ArrowDown') {
            setActiveIndex((prev) => (prev + 1) % filtered.length);
            return true;
          }
          if (key === 'Enter' || key === 'Tab') {
            const cmd = filtered[activeIndex];
            if (cmd) handleSelect(cmd.id);
            return true;
          }
          if (key === 'Escape') {
            onClose();
            return true;
          }
          return false;
        },
      }),
      [filtered, activeIndex, handleSelect, onClose],
    );

    if (filtered.length === 0) return null;

    return (
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl">
        <div className="p-1">
          {filtered.map((cmd, index) => {
            const Icon = cmd.icon;
            const isActive = index === activeIndex;
            return (
              <button
                key={cmd.id}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent textarea blur
                  handleSelect(cmd.id);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                )}
                data-active={isActive || undefined}
                aria-current={isActive || undefined}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <span className="font-medium text-sm">{cmd.label}</span>
                <span
                  className={cn('text-sm', isActive ? 'text-primary/70' : 'text-muted-foreground')}
                >
                  {cmd.description}
                </span>
                {isActive && (
                  <span className="ml-auto shrink-0 text-[10px] text-primary/50 font-medium">
                    Enter
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/40 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            ↑↓ navigate · Enter select · Esc dismiss
          </span>
        </div>
      </div>
    );
  },
);
