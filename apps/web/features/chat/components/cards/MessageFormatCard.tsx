'use client';

/**
 * MessageFormatCard — the safe wiring for the heuristic format cards.
 *
 * The four cards in this directory (recipe / comparison / steps / calculation)
 * parse the assistant's markdown into a structured layout. Every one of them
 * is a heuristic parser that `continue`s past anything it does not recognise,
 * so any of them CAN drop content — `RecipeCard` provably does: once a section
 * other than ingredients/instructions starts, it sets `currentSection='other'`
 * and nothing collects it, so a trailing "Notes" or "Variations" disappears.
 *
 * That is why this wrapper exists, and why it is the only sanctioned way to
 * render these cards. Swapping a card in FOR the prose would make an answer
 * silently lossy — the failure mode that is worse than having no card at all,
 * because the user cannot tell that anything is missing.
 *
 * The guarantee here is structural rather than parser-by-parser: the exact
 * model output is always one click away, so a parser gap costs a toggle, never
 * the content. Improving an individual parser then becomes an enhancement
 * instead of a correctness prerequisite.
 */

import { useState } from 'react';
import { FileText, LayoutGrid } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { MessageCardRenderer, type CardType } from './index';

interface MessageFormatCardProps {
  content: string;
  cardType: Exclude<CardType, null>;
  /** Rendered when the reader switches to the original markdown. */
  children: React.ReactNode;
}

const LABELS: Record<Exclude<CardType, null>, string> = {
  recipe: 'Recipe',
  comparison: 'Comparison',
  steps: 'Steps',
  calculation: 'Calculation',
};

export function MessageFormatCard({ content, cardType, children }: MessageFormatCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div data-testid="message-format-card" data-card-type={cardType}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {LABELS[cardType]}
        </span>
        <span className="flex-1" aria-hidden="true" />
        <div className="flex items-center rounded-md border border-[var(--chat-border)] bg-[var(--chat-glass)] p-0.5">
          <button
            type="button"
            onClick={() => setShowOriginal(false)}
            aria-pressed={!showOriginal}
            aria-label="Formatted view"
            title="Formatted"
            className={cn(
              'grid size-6 place-items-center rounded transition-colors',
              showOriginal
                ? 'text-muted-foreground hover:text-foreground'
                : 'bg-primary/15 text-primary',
            )}
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            aria-pressed={showOriginal}
            aria-label="Original response"
            title="Original response"
            className={cn(
              'grid size-6 place-items-center rounded transition-colors',
              showOriginal
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showOriginal ? children : <MessageCardRenderer content={content} cardType={cardType} />}
    </div>
  );
}
