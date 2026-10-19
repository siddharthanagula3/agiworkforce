'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import type { FlashcardSet } from './study-set';

function shuffled(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

export function FlashcardsView({ set }: { set: FlashcardSet }) {
  const [order, setOrder] = useState<number[]>(() => set.cards.map((_, index) => index));
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(() => new Set());
  const total = order.length;
  const cardIndex = order[Math.min(position, total - 1)] ?? 0;
  const card = set.cards[cardIndex]!;
  const learning = useMemo(
    () => set.cards.map((_, index) => index).filter((index) => !known.has(index)),
    [set.cards, known],
  );

  const go = (next: number) => {
    setPosition(Math.max(0, Math.min(total - 1, next)));
    setFlipped(false);
  };

  const mark = (knowsIt: boolean) => {
    setKnown((current) => {
      const next = new Set(current);
      if (knowsIt) next.add(cardIndex);
      else next.delete(cardIndex);
      return next;
    });
    if (position < total - 1) go(position + 1);
    else setFlipped(false);
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4"
      aria-label={set.title || 'Flashcards'}
      data-testid="flashcards-view"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{set.title || 'Flashcards'}</span>
        <span className="tabular-nums">
          Card {position + 1} of {total} · {known.size} known
        </span>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? 'Show the front' : 'Show the back'}
        className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-[var(--chat-border-strong)] bg-background px-6 py-8 text-center transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="flashcard"
      >
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {flipped ? 'Back' : 'Front'}
        </span>
        <span className="whitespace-pre-wrap text-lg text-foreground" aria-live="polite">
          {flipped ? card.back : card.front}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(position - 1)}
          disabled={position === 0}
          aria-label="Previous card"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(position + 1)}
          disabled={position >= total - 1}
          aria-label="Next card"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        {flipped ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mark(false)}
              data-testid="flashcard-again"
            >
              Still learning
            </Button>
            <Button size="sm" onClick={() => mark(true)} data-testid="flashcard-known">
              Got it
            </Button>
          </>
        ) : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOrder(shuffled(set.cards.length));
            setPosition(0);
            setFlipped(false);
          }}
          aria-label="Shuffle cards"
        >
          <Shuffle className="h-4 w-4" aria-hidden="true" />
        </Button>
        {known.size > 0 && learning.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOrder(learning);
              setPosition(0);
              setFlipped(false);
            }}
            data-testid="flashcards-review-learning"
          >
            <RotateCcw className="me-1 h-3.5 w-3.5" aria-hidden="true" />
            Review {learning.length} still learning
          </Button>
        ) : null}
      </div>
    </section>
  );
}
