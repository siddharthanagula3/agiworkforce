'use client';

import { useState } from 'react';
import { FileText, LayoutGrid } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { MessageCardRenderer, type CardType } from './index';

interface MessageFormatCardProps {
  content: string;
  cardType: Exclude<CardType, null>;
  children: React.ReactNode;
  messageId?: string;
}

const LABELS: Record<Exclude<CardType, null>, string> = {
  recipe: 'Recipe',
  comparison: 'Comparison',
  steps: 'Steps',
  calculation: 'Calculation',
};

export function MessageFormatCard({
  content,
  cardType,
  children,
  messageId,
}: MessageFormatCardProps) {
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

      {showOriginal ? (
        children
      ) : (
        <MessageCardRenderer
          content={content}
          cardType={cardType}
          {...(messageId ? { messageId } : {})}
        />
      )}
    </div>
  );
}
