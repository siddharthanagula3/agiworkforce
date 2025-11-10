/**
 * CommandAutocomplete Component
 *
 * Displays autocomplete suggestions for @file, @folder, @url, @web commands.
 * Positioned relative to the input cursor.
 */

import { memo } from 'react';
import { File, Folder, Link, Globe, type LucideIcon } from 'lucide-react';
import type { ContextSuggestion, AutocompleteState } from '@agiworkforce/types';
import { cn } from '../../lib/utils';

interface CommandAutocompleteProps {
  state: AutocompleteState;
  onSelect: (suggestion: ContextSuggestion) => void;
  className?: string;
}

/**
 * Get icon for suggestion type
 */
function getIconForType(type: string): LucideIcon {
  switch (type) {
    case 'file':
      return File;
    case 'folder':
      return Folder;
    case 'url':
      return Link;
    case 'web':
      return Globe;
    default:
      return File;
  }
}

function CommandAutocompleteComponent({ state, onSelect, className }: CommandAutocompleteProps) {
  if (!state.active || state.suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute bottom-full left-0 mb-2 w-full max-w-md',
        'rounded-lg border border-border bg-popover shadow-lg',
        'max-h-64 overflow-y-auto',
        'z-50',
        className,
      )}
      role="listbox"
      aria-label="Command suggestions"
    >
      <div className="p-1">
        {state.suggestions.map((suggestion, index) => {
          const Icon = getIconForType(suggestion.type);
          const isSelected = index === state.selectedIndex;

          return (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(suggestion)}
              className={cn(
                'w-full flex items-start gap-3 rounded-md px-3 py-2 text-left',
                'transition-colors duration-100',
                isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 mt-0.5 flex-shrink-0',
                  isSelected ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <div className="flex-1 min-w-0">
                <div className={cn('font-medium text-sm', isSelected && 'text-primary')}>
                  {suggestion.label}
                </div>
                {suggestion.description && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {suggestion.description}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer with hint */}
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground bg-muted/30">
        <span className="font-medium">↑↓</span> Navigate <span className="font-medium ml-2">↵</span>{' '}
        Select <span className="font-medium ml-2">Esc</span> Cancel
      </div>
    </div>
  );
}

export const CommandAutocomplete = memo(CommandAutocompleteComponent);
CommandAutocomplete.displayName = 'CommandAutocomplete';
