import React, { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../lib/utils';
import type { SlashCommand } from '../lib/slashCommands';

export interface CommandSuggestion {
  id?: string;
  command: string;
  description: string;
  example?: string;
  icon?: ReactNode;
  isSkill?: boolean;
  slashCommand?: SlashCommand;
  /**
   * Consecutive suggestions sharing a label render under one heading. Omit it
   * and the suggestion renders loose, which is what every caller that never
   * groups anything gets.
   */
  groupLabel?: string;
}

interface RenderSegment {
  label?: string;
  entries: { suggestion: CommandSuggestion; index: number }[];
}

function toSegments(suggestions: CommandSuggestion[]): RenderSegment[] {
  const segments: RenderSegment[] = [];
  suggestions.forEach((suggestion, index) => {
    const current = segments[segments.length - 1];
    if (current && current.label === suggestion.groupLabel) {
      current.entries.push({ suggestion, index });
      return;
    }
    segments.push({ label: suggestion.groupLabel, entries: [{ suggestion, index }] });
  });
  return segments;
}

export interface SlashCommandMenuProps {
  show: boolean;
  suggestions: CommandSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: CommandSuggestion) => void;
  onHover: (index: number) => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  show,
  suggestions,
  selectedIndex,
  onSelect,
  onHover,
}) => {
  return (
    <AnimatePresence>
      {show && suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-[hsl(var(--popover))] border border-[hsl(var(--border))] shadow-lg overflow-hidden z-50"
          role="listbox"
          aria-label="Slash command suggestions"
        >
          <div className="max-h-72 overflow-y-auto">
            {toSegments(suggestions).map((segment, segmentIndex) => {
              const rows = segment.entries.map(({ suggestion, index }) => (
                <button
                  type="button"
                  key={suggestion.id ?? suggestion.command}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(suggestion);
                  }}
                  onMouseEnter={() => onHover(index)}
                  role="option"
                  aria-selected={index === selectedIndex}
                  data-active={index === selectedIndex || undefined}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors border-b border-[hsl(var(--border))]/50 last:border-b-0',
                    index === selectedIndex ? 'bg-primary/10' : 'hover:bg-[hsl(var(--accent))]',
                  )}
                >
                  <div className="flex items-center gap-3">
                    {suggestion.icon && (
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                        aria-hidden
                      >
                        {suggestion.icon}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <code className="shrink-0 text-sm font-semibold text-primary">
                          {suggestion.command}
                        </code>
                        <span
                          title={suggestion.description}
                          className="truncate text-xs text-[hsl(var(--muted-foreground))]"
                        >
                          {suggestion.description}
                        </span>
                      </div>
                      {suggestion.example && (
                        <div className="truncate text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          {suggestion.example}
                        </div>
                      )}
                    </div>
                    {suggestion.isSkill && (
                      <span className="ml-auto shrink-0 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[12px] font-medium text-amber-400">
                        skill
                      </span>
                    )}
                  </div>
                </button>
              ));

              if (!segment.label) {
                return <React.Fragment key={`ungrouped-${segmentIndex}`}>{rows}</React.Fragment>;
              }
              return (
                <div
                  role="group"
                  aria-label={segment.label}
                  key={`${segment.label}-${segmentIndex}`}
                >
                  <div className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {segment.label}
                  </div>
                  {rows}
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 bg-[hsl(var(--muted))] border-t border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))]">
            Use arrow keys to navigate, Enter to select, Esc to close
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SlashCommandMenu;
