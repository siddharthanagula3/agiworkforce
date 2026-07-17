/**
 * SlashCommandMenu — Phase A Slice 5 (ported from UAC)
 *
 * Autocomplete dropdown for slash commands with keyboard navigation.
 * Consumes the slash command registry from the package lib.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../lib/utils';
import type { SlashCommand } from '../lib/slashCommands';

// Re-export CommandSuggestion shape so hosts that built on the UAC type can use this.
export interface CommandSuggestion {
  command: string;
  description: string;
  example?: string;
  icon?: string;
  /** The underlying SlashCommand registry entry, if available. */
  slashCommand?: SlashCommand;
}

export interface SlashCommandMenuProps {
  /** Whether to show the menu */
  show: boolean;
  /** List of command suggestions */
  suggestions: CommandSuggestion[];
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when a suggestion is selected */
  onSelect: (suggestion: CommandSuggestion) => void;
  /** Callback when hovering over a suggestion */
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
            {suggestions.map((suggestion, index) => (
              <button
                type="button"
                key={suggestion.command}
                onClick={() => onSelect(suggestion)}
                onMouseEnter={() => onHover(index)}
                role="option"
                aria-selected={index === selectedIndex}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors border-b border-[hsl(var(--border))]/50 last:border-b-0',
                  index === selectedIndex ? 'bg-primary/10' : 'hover:bg-[hsl(var(--accent))]',
                )}
              >
                <div className="flex items-center gap-3">
                  {suggestion.icon && (
                    <span className="text-lg" aria-hidden="true">
                      {suggestion.icon}
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-semibold text-primary">
                        {suggestion.command}
                      </code>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {suggestion.description}
                      </span>
                    </div>
                    {suggestion.example && (
                      <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        {suggestion.example}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
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
