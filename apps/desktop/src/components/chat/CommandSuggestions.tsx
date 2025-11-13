import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Command, Code, FileText, Bug, RefreshCw, Sparkles, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CommandSuggestion {
  command: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  category?: 'code' | 'chat' | 'workflow';
}

interface CommandSuggestionsProps {
  suggestions: CommandSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: CommandSuggestion) => void;
  className?: string;
  position?: { top: number; left: number };
}

// Default slash commands
export const DEFAULT_COMMANDS: CommandSuggestion[] = [
  {
    command: '/fix',
    description: 'Fix bugs or errors in the selected code',
    icon: Bug,
    category: 'code',
  },
  {
    command: '/explain',
    description: 'Explain how the selected code works',
    icon: MessageSquare,
    category: 'code',
  },
  {
    command: '/refactor',
    description: 'Refactor and improve code quality',
    icon: RefreshCw,
    category: 'code',
  },
  {
    command: '/document',
    description: 'Generate documentation for code',
    icon: FileText,
    category: 'code',
  },
  {
    command: '/optimize',
    description: 'Optimize code performance',
    icon: Sparkles,
    category: 'code',
  },
  {
    command: '/test',
    description: 'Generate unit tests for code',
    icon: Code,
    category: 'code',
  },
  {
    command: '/review',
    description: 'Review code for issues and improvements',
    icon: FileText,
    category: 'code',
  },
];

function CommandSuggestionsComponent({
  suggestions,
  selectedIndex,
  onSelect,
  className,
  position,
}: CommandSuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={listRef}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'absolute bottom-full left-0 z-50 mb-2 w-full max-w-md overflow-hidden rounded-lg border border-border bg-popover shadow-lg',
          className,
        )}
        style={position}
      >
        <div className="max-h-80 overflow-y-auto p-1">
          <div className="mb-1 px-3 py-2 text-xs font-medium text-muted-foreground">
            Slash Commands
          </div>

          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon || Command;
            const isSelected = index === selectedIndex;

            return (
              <button
                key={suggestion.command}
                ref={isSelected ? selectedRef : undefined}
                type="button"
                onClick={() => onSelect(suggestion)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted/50',
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-4 w-4 flex-shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground',
                  )}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{suggestion.command}</span>
                    {suggestion.category && (
                      <span className="text-xs text-muted-foreground">
                        {suggestion.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {suggestion.description}
                  </p>
                </div>

                {isSelected && (
                  <kbd className="ml-auto flex-shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                    ↵
                  </kbd>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium">↑↓</span> Navigate •{' '}
          <span className="font-medium">Enter</span> Select •{' '}
          <span className="font-medium">Esc</span> Close
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsComponent, (prev, next) => {
  return (
    prev.suggestions === next.suggestions &&
    prev.selectedIndex === next.selectedIndex &&
    prev.className === next.className
  );
});

CommandSuggestions.displayName = 'CommandSuggestions';
