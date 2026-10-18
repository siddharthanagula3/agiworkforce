'use client';

import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { MessageCardRenderer, type CardType } from './index';

interface MessageFormatCardProps {
  content: string;
  cardType: Exclude<CardType, null>;
  children: React.ReactNode;
  messageId?: string;
}

const LABELS: Record<Exclude<CardType, null>, string> = {
  recipe: 'recipe',
  comparison: 'comparison',
  steps: 'steps',
  calculation: 'calculation',
};

/**
 * The answer itself is always what the model wrote. A card is a second way to
 * look at the same content, offered underneath it.
 *
 * The card never replaces the answer: it is chosen by a text heuristic, so a
 * response carrying two display-math blocks and an equals sign could read as a
 * "Calculation" and lose its headings, emphasis, links, nesting, code and
 * tables.
 */
export function MessageFormatCard({
  content,
  cardType,
  children,
  messageId,
}: MessageFormatCardProps) {
  const [showCard, setShowCard] = useState(false);

  return (
    <div data-testid="message-format-card" data-card-type={cardType}>
      {children}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowCard((v) => !v)}
          aria-expanded={showCard}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors',
            'text-muted-foreground hover:text-foreground',
          )}
        >
          <LayoutGrid className="size-3.5" aria-hidden="true" />
          {showCard ? `Hide ${LABELS[cardType]} view` : `View as ${LABELS[cardType]}`}
        </button>
      </div>

      {showCard ? (
        <div className="mt-2">
          <MessageCardRenderer
            content={content}
            cardType={cardType}
            {...(messageId ? { messageId } : {})}
          />
        </div>
      ) : null}
    </div>
  );
}
