'use client';

import { memo } from 'react';
import { ChevronLeft, ChevronRight } from '@agiworkforce/icons';
import { Button } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { ACTION_BUTTON_SIZE } from './messageActionRow';

const CHEVRON_SIZE = 'h-3.5 w-3.5';

export type VariantPagerKind = 'response' | 'edit';

const VARIANT_PAGER_LABELS: Record<
  VariantPagerKind,
  { previous: string; next: string; position: (position: number, total: number) => string }
> = {
  response: {
    previous: 'Previous response',
    next: 'Next response',
    position: (position, total) => `Response ${position} of ${total}`,
  },
  edit: {
    previous: 'Previous version',
    next: 'Next version',
    position: (position, total) => `Edited message, version ${position} of ${total}`,
  },
};

export interface VariantPagerProps {
  /** Zero-based position of the rendered message within its sibling group. */
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  /** True while the conversation streams: paging mid-turn is not offered. */
  disabled?: boolean;
  kind?: VariantPagerKind;
}

/**
 * Pages between the answers a question has collected, or the revisions a
 * message has been through.
 *
 * Deliberately not BranchNavigator, which paginates whole conversations: its
 * props are branch/conversation ids, and its `h-4` chevrons are a 16px target
 * in a row where every other control is 44px on touch.
 */
function VariantPagerComponent({
  index,
  total,
  onPrevious,
  onNext,
  disabled,
  kind = 'response',
}: VariantPagerProps) {
  if (total <= 1) return null;

  const labels = VARIANT_PAGER_LABELS[kind];
  const position = index + 1;
  const atStart = index <= 0;
  const atEnd = index >= total - 1;

  return (
    <div className="flex items-center" data-testid="variant-pager">
      <Button
        variant="ghost"
        size="icon"
        className={ACTION_BUTTON_SIZE}
        disabled={disabled || atStart}
        onClick={onPrevious}
        aria-label={labels.previous}
      >
        <ChevronLeft className={CHEVRON_SIZE} aria-hidden="true" />
      </Button>
      {/* Read out by the live region below instead, so paging announces a
          sentence rather than the two characters either side of a slash. */}
      <span
        aria-hidden="true"
        title={labels.position(position, total)}
        className={cn(
          'min-w-[2.5rem] px-0.5 text-center font-mono text-caption tabular-nums',
          'text-muted-foreground',
        )}
      >
        {position}/{total}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={ACTION_BUTTON_SIZE}
        disabled={disabled || atEnd}
        onClick={onNext}
        aria-label={labels.next}
      >
        <ChevronRight className={CHEVRON_SIZE} aria-hidden="true" />
      </Button>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {labels.position(position, total)}
      </span>
    </div>
  );
}

export const VariantPager = memo(VariantPagerComponent);
VariantPager.displayName = 'VariantPager';
