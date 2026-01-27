/**
 * MemoryCard Component
 *
 * Displays a single memory entry with expandable content,
 * category badge, importance stars, and action buttons.
 */
import { memo, useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, Star, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { MemoryCategory, MemoryEntry } from '@/stores/memoryStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatRelativeTime } from '@/lib/utils';

/**
 * Category color mapping for visual distinction
 */
const CATEGORY_COLORS: Record<MemoryCategory, { bg: string; text: string; border: string }> = {
  preference: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-500/30',
  },
  fact: {
    bg: 'bg-green-500/10',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-500/30',
  },
  decision: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-500/30',
  },
  context: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-700 dark:text-gray-300',
    border: 'border-gray-500/30',
  },
};

/**
 * Category display labels
 */
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preference',
  fact: 'Fact',
  decision: 'Decision',
  context: 'Context',
};

export interface MemoryCardProps {
  memory: MemoryEntry;
  /** Highlighted search text to display */
  highlightText?: string;
  /** Callback when importance is changed */
  onImportanceChange?: (memory: MemoryEntry, newImportance: number) => void;
}

/**
 * Renders importance as star icons
 */
function ImportanceStars({
  importance,
  onHover,
  onSelect,
  interactive = false,
}: {
  importance: number;
  onHover?: (value: number | null) => void;
  onSelect?: (value: number) => void;
  interactive?: boolean;
}) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const displayValue = hoveredValue ?? importance;

  const handleMouseEnter = (value: number) => {
    if (interactive) {
      setHoveredValue(value);
      onHover?.(value);
    }
  };

  const handleMouseLeave = () => {
    if (interactive) {
      setHoveredValue(null);
      onHover?.(null);
    }
  };

  const handleClick = (value: number) => {
    if (interactive) {
      onSelect?.(value);
    }
  };

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={handleMouseLeave}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
        <button
          key={value}
          type="button"
          disabled={!interactive}
          onMouseEnter={() => handleMouseEnter(value)}
          onClick={() => handleClick(value)}
          className={cn(
            'p-0 h-4 w-4 transition-colors',
            interactive && 'cursor-pointer hover:scale-110',
            !interactive && 'cursor-default',
          )}
          aria-label={`Set importance to ${value}`}
        >
          <Star
            className={cn(
              'h-4 w-4',
              value <= displayValue
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-transparent text-muted-foreground/40',
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Highlights matching text in content
 */
function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight || !highlight.trim()) {
    return <span>{text}</span>;
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(highlight)})`, 'gi'));

  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const MemoryCard = memo(function MemoryCard({
  memory,
  highlightText,
  onImportanceChange,
}: MemoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditingImportance, setIsEditingImportance] = useState(false);

  const { forget, remember } = useMemoryStore();

  const categoryColors = CATEGORY_COLORS[memory.category];
  const categoryLabel = CATEGORY_LABELS[memory.category];

  // Truncate content for preview
  const contentPreview =
    memory.content.length > 150 ? `${memory.content.slice(0, 150)}...` : memory.content;
  const showExpandButton = memory.content.length > 150;

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await forget(memory.category, memory.topic);
    } catch {
      // Error is already handled by the store with toast
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [forget, memory.category, memory.topic]);

  const handleImportanceChange = useCallback(
    async (newImportance: number) => {
      try {
        // Update the memory with new importance
        await remember(memory.category, memory.topic, memory.content, newImportance);
        onImportanceChange?.(memory, newImportance);
        setIsEditingImportance(false);
      } catch {
        // Error is already handled by the store with toast
      }
    },
    [remember, memory, onImportanceChange],
  );

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <>
      <Card
        className={cn(
          'group transition-all duration-200 hover:shadow-md',
          categoryColors.border,
          'border-l-4',
        )}
      >
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={cn(categoryColors.bg, categoryColors.text, 'border-0')}>
                  {categoryLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(new Date(memory.updated_at))}
                </span>
              </div>
              <h4 className="font-medium text-sm line-clamp-1">
                <HighlightedText text={memory.topic} highlight={highlightText} />
              </h4>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                aria-label="Delete memory"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pb-4 px-4 space-y-3">
          {/* Content */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            <HighlightedText
              text={isExpanded ? memory.content : contentPreview}
              highlight={highlightText}
            />
          </p>

          {/* Expand/Collapse Button */}
          {showExpandButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpand}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show more
                </>
              )}
            </Button>
          )}

          {/* Importance Section */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Importance:</span>
              {isEditingImportance ? (
                <ImportanceStars
                  importance={memory.importance}
                  interactive
                  onSelect={handleImportanceChange}
                />
              ) : (
                <div
                  className="flex items-center gap-1 cursor-pointer"
                  onClick={() => setIsEditingImportance(true)}
                  title="Click to edit importance"
                >
                  <ImportanceStars importance={memory.importance} />
                  <span className="text-xs text-muted-foreground ml-1">
                    ({memory.importance}/10)
                  </span>
                </div>
              )}
            </div>
            {isEditingImportance && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingImportance(false)}
                className="h-6 px-2 text-xs"
              >
                Cancel
              </Button>
            )}
          </div>

          {/* Source (if available) */}
          {memory.source && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Source:</span> {memory.source}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Memory"
        description={`Are you sure you want to forget "${memory.topic}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Keep"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
});
