'use client';

import { useMemo, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { buildChangeReview, resolveReview } from './change-review';

export function ArtifactChangesReview({
  previous,
  next,
  fromVersion,
  toVersion,
  onApply,
  onClose,
}: {
  previous: string;
  next: string;
  fromVersion: number;
  toVersion: number;
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  const review = useMemo(() => buildChangeReview(previous, next), [previous, next]);
  const [undone, setUndone] = useState<Set<number>>(() => new Set());

  if (!review) {
    return (
      <div className="p-6 text-sm text-muted-foreground" role="status">
        These versions differ too much to review change by change. Use Show changes, or restore a
        version from the history.
      </div>
    );
  }

  const toggle = (index: number) =>
    setUndone((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(index)) nextSet.delete(index);
      else nextSet.add(index);
      return nextSet;
    });

  const kept = review.changeCount - undone.size;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="artifact-changes-review">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/30 px-4 py-2">
        <p className="flex-1 text-xs text-muted-foreground" role="status">
          Version {toVersion} against version {fromVersion}: {review.changeCount} changes, keeping{' '}
          {kept}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setUndone(new Set())}
        >
          Keep all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() =>
            setUndone(new Set(Array.from({ length: review.changeCount }, (_, index) => index)))
          }
        >
          Undo all
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={undone.size === 0}
          onClick={() => onApply(resolveReview(review, undone))}
          data-testid="artifact-review-apply"
        >
          Save my choices
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {review.pieces.map((piece, position) => {
            if (piece.kind === 'same') return <span key={position}>{piece.text}</span>;
            const isUndone = undone.has(piece.index);
            return (
              <span key={position} className="inline">
                {piece.removed ? (
                  <del
                    className={cn(
                      'bg-diff-removed-fill text-diff-removed-text',
                      isUndone ? 'no-underline' : 'line-through',
                    )}
                  >
                    <span className="sr-only">{isUndone ? 'Kept: ' : 'Removed: '}</span>
                    {piece.removed}
                  </del>
                ) : null}
                {piece.added ? (
                  <ins
                    className={cn(
                      'bg-diff-added-fill text-diff-added-text',
                      isUndone ? 'line-through opacity-60' : 'underline',
                    )}
                  >
                    <span className="sr-only">{isUndone ? 'Undone: ' : 'Added: '}</span>
                    {piece.added}
                  </ins>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggle(piece.index)}
                  aria-pressed={isUndone}
                  aria-label={
                    isUndone ? `Keep change ${piece.index + 1}` : `Undo change ${piece.index + 1}`
                  }
                  className="mx-0.5 inline-flex h-6 w-6 translate-y-1 items-center justify-center rounded-compact border border-border/60 text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`artifact-review-toggle-${piece.index}`}
                >
                  {isUndone ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
