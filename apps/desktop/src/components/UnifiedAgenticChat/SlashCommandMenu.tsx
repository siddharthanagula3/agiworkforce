/**
 * SlashCommandMenu Component
 *
 * Displays an autocomplete dropdown for slash commands with navigation support.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import type { CommandSuggestion } from '../../hooks/useSlashCommandAutocomplete';

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
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white dark:bg-charcoal-800 border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden z-50"
          role="listbox"
          aria-label="Slash command suggestions"
        >
          <div className="max-h-72 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.command}
                onClick={() => onSelect(suggestion)}
                onMouseEnter={() => onHover(index)}
                role="option"
                aria-selected={index === selectedIndex}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0',
                  index === selectedIndex
                    ? 'bg-primary/10 dark:bg-primary/10'
                    : 'hover:bg-gray-50 dark:hover:bg-charcoal-700',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden="true">
                    {suggestion.icon}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-semibold text-primary">
                        {suggestion.command}
                      </code>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {suggestion.description}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {suggestion.example}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2 bg-gray-50 dark:bg-charcoal-700/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            Use arrow keys to navigate, Enter to select, Esc to close
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SlashCommandMenu;
