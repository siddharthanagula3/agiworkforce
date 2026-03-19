/**
 * EmojiReactions - Slack/Discord-style emoji reaction system
 *
 * Provides:
 * - Quick reaction bar with 6 common emojis
 * - Expandable grid with 30 popular emojis
 * - Toggle-to-react behavior (click to add, click again to remove)
 * - Reaction count badges displayed below messages
 */

import { useState, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@shared/ui/popover';
import { Button } from '@shared/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import { SmilePlus, Plus } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Reaction data
// ---------------------------------------------------------------------------

export interface Reaction {
  emoji: string;
  count: number;
}

/** The 6 quick-access emojis shown in the compact picker. */
export const QUICK_EMOJIS = [
  { emoji: '\u{1F44D}', label: 'Thumbs up' },
  { emoji: '\u{1F44E}', label: 'Thumbs down' },
  { emoji: '\u{2764}\u{FE0F}', label: 'Heart' },
  { emoji: '\u{1F602}', label: 'Laughing' },
  { emoji: '\u{1F914}', label: 'Thinking' },
  { emoji: '\u{1F389}', label: 'Party' },
] as const;

/** Extended emoji set shown in the full grid (30 total). */
export const EXTENDED_EMOJIS = [
  ...QUICK_EMOJIS,
  { emoji: '\u{1F525}', label: 'Fire' },
  { emoji: '\u{1F440}', label: 'Eyes' },
  { emoji: '\u{1F680}', label: 'Rocket' },
  { emoji: '\u{2705}', label: 'Check mark' },
  { emoji: '\u{274C}', label: 'Cross mark' },
  { emoji: '\u{1F4AF}', label: 'Hundred' },
  { emoji: '\u{1F64F}', label: 'Pray' },
  { emoji: '\u{1F60D}', label: 'Heart eyes' },
  { emoji: '\u{1F62E}', label: 'Surprised' },
  { emoji: '\u{1F622}', label: 'Crying' },
  { emoji: '\u{1F60E}', label: 'Cool' },
  { emoji: '\u{1F923}', label: 'ROFL' },
  { emoji: '\u{1F4A1}', label: 'Light bulb' },
  { emoji: '\u{1F44F}', label: 'Clap' },
  { emoji: '\u{1F917}', label: 'Hugging' },
  { emoji: '\u{1F4AA}', label: 'Strong' },
  { emoji: '\u{2728}', label: 'Sparkles' },
  { emoji: '\u{1F31F}', label: 'Glowing star' },
  { emoji: '\u{1F60A}', label: 'Smiling' },
  { emoji: '\u{1F62D}', label: 'Sobbing' },
  { emoji: '\u{1F60F}', label: 'Smirking' },
  { emoji: '\u{1F4AC}', label: 'Speech bubble' },
  { emoji: '\u{1F47E}', label: 'Alien monster' },
  { emoji: '\u{26A1}', label: 'Lightning' },
] as const;

// ---------------------------------------------------------------------------
// ReactionBadge - individual reaction count pill below a message
// ---------------------------------------------------------------------------

interface ReactionBadgeProps {
  emoji: string;
  count: number;
  onClick: () => void;
}

function ReactionBadge({ emoji, count, onClick }: ReactionBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        'transition-colors duration-150',
        'border-border bg-muted/40 hover:bg-muted hover:border-primary/30',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
      aria-label={`${emoji} ${count}`}
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span className="font-medium text-muted-foreground">{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ReactionBadges - row of badges displayed below the message
// ---------------------------------------------------------------------------

interface ReactionBadgesProps {
  reactions: Reaction[];
  onToggle: (emoji: string) => void;
}

export function ReactionBadges({ reactions, onToggle }: ReactionBadgesProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5" role="group" aria-label="Message reactions">
      {reactions.map((r) => (
        <ReactionBadge
          key={r.emoji}
          emoji={r.emoji}
          count={r.count}
          onClick={() => onToggle(r.emoji)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmojiReactionPicker - popover with quick bar + expandable full grid
// ---------------------------------------------------------------------------

interface EmojiReactionPickerProps {
  onSelect: (emoji: string) => void;
  /** Additional className applied to the trigger button. */
  triggerClassName?: string;
}

export function EmojiReactionPicker({ onSelect, triggerClassName }: EmojiReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      setOpen(false);
      setShowGrid(false);
    },
    [onSelect],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setShowGrid(false);
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 md:h-7 md:w-7 text-muted-foreground hover:text-foreground',
            triggerClassName,
          )}
          aria-label="Add reaction"
        >
          <SmilePlus className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="top" sideOffset={8}>
        {!showGrid ? (
          /* ---- Quick reaction bar ---- */
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={200}>
              {QUICK_EMOJIS.map(({ emoji, label }) => (
                <Tooltip key={emoji}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-lg hover:bg-muted hover:scale-110 transition-transform"
                      onClick={() => handleSelect(emoji)}
                    >
                      {emoji}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>

            {/* Expand button to show full grid */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => setShowGrid(true)}
              aria-label="Show more emojis"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          /* ---- Full emoji grid (5 columns x 6 rows = 30) ---- */
          <div>
            <div className="grid grid-cols-6 gap-0.5">
              <TooltipProvider delayDuration={200}>
                {EXTENDED_EMOJIS.map(({ emoji, label }) => (
                  <Tooltip key={emoji}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-lg hover:bg-muted hover:scale-110 transition-transform"
                        onClick={() => handleSelect(emoji)}
                      >
                        {emoji}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {label}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
