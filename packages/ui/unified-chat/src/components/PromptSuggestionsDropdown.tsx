/**
 * PromptSuggestionsDropdown — Phase A Slice 5 (ported from UAC)
 *
 * Displays prompt continuation suggestions like Gemini CLI.
 * Shows contextual suggestions as user types.
 *
 * No desktop-specific dependencies.
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

export type PromptSuggestionType = 'continuation' | 'expansion' | 'alternative' | 'code' | string;

export interface PromptSuggestion {
  text: string;
  description: string;
  icon?: string;
  type: PromptSuggestionType;
}

export interface PromptSuggestionsDropdownProps {
  suggestions: PromptSuggestion[];
  isVisible: boolean;
  selectedIndex: number;
  onSelectSuggestion: (suggestion: PromptSuggestion) => void;
  onMouseEnterSuggestion?: (index: number) => void;
}

const TYPE_CLASS: Record<string, string> = {
  continuation: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  expansion: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  alternative: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  code: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

const PromptSuggestionsDropdownComponent: React.FC<PromptSuggestionsDropdownProps> = memo(
  ({ suggestions, isVisible, selectedIndex, onSelectSuggestion, onMouseEnterSuggestion }) => {
    if (suggestions.length === 0 || !isVisible) {
      return null;
    }

    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-[hsl(var(--popover))] border border-[hsl(var(--border))] shadow-lg overflow-hidden z-50"
            role="listbox"
            aria-label="Prompt suggestions"
            aria-expanded={isVisible}
          >
            {/* Header */}
            <div className="px-3 py-2 bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  Suggestions
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  (Tab to accept, Esc to dismiss)
                </span>
              </div>
            </div>

            {/* Suggestions List */}
            <div className="max-h-72 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={index}
                  onClick={() => onSelectSuggestion(suggestion)}
                  onMouseEnter={() => onMouseEnterSuggestion?.(index)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors border-b border-[hsl(var(--border))]/50 last:border-b-0 flex items-center justify-between gap-3 group',
                    index === selectedIndex ? 'bg-primary/10' : 'hover:bg-[hsl(var(--accent))]',
                  )}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-label={`${suggestion.text} - ${suggestion.description}`}
                  title={suggestion.description}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {suggestion.icon && (
                        <span className="text-lg shrink-0">{suggestion.icon}</span>
                      )}
                      <span className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                        {suggestion.text}
                      </span>
                    </div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {suggestion.description}
                    </div>
                  </div>

                  {/* Type Badge */}
                  <div className="shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        TYPE_CLASS[suggestion.type] ??
                          'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                      )}
                    >
                      {suggestion.type}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 bg-[hsl(var(--muted))] border-t border-[hsl(var(--border))]/50 text-xs text-[hsl(var(--muted-foreground))] flex items-center justify-between">
              <span>Select suggestion and press Tab</span>
              <ChevronRight size={14} className="opacity-50" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

PromptSuggestionsDropdownComponent.displayName = 'PromptSuggestionsDropdown';

export { PromptSuggestionsDropdownComponent as PromptSuggestionsDropdown };
