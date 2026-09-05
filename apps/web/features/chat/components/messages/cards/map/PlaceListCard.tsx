'use client';

import { useState } from 'react';
import { MapPinned, Star } from '@agiworkforce/icons';
import type { PlacesCardPlace } from '@agiworkforce/types';
import { placePhotoUrl, PLACE_PHOTO_THUMBNAIL_WIDTH_PX } from '@/lib/maps/place-photo-url';
import { cn } from '@shared/lib/utils';
import { openNowLabel, placeSummaryLine, ratingLabel, reviewCountLabel } from './placeFacts';

interface PlaceListCardProps {
  place: PlacesCardPlace;
  selected: boolean;
  onSelect: () => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
}

export function PlaceListCard({ place, selected, onSelect, buttonRef }: PlaceListCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = place.photos?.[0];
  const rating = ratingLabel(place.rating);
  const reviews = reviewCountLabel(place.reviewCount);
  const open = openNowLabel(place.openNow);
  const summary = placeSummaryLine(place);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="places-list-card"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors',
        'bg-[var(--chat-surface-elevated)] hover:bg-[var(--chat-surface-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
        selected ? 'border-[var(--chat-accent-primary)]' : 'border-[var(--chat-border-strong)]',
      )}
    >
      {/* The square is always drawn: a row that loses it stops lining up with
          the rows above, which reads as a broken card rather than a place
          without a picture. */}
      {photo && !photoFailed ? (
        <img
          src={placePhotoUrl(photo.reference, PLACE_PHOTO_THUMBNAIL_WIDTH_PX)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
          className="size-12 shrink-0 rounded-lg bg-[var(--chat-surface-hover)] object-cover"
        />
      ) : (
        <span
          data-testid="places-photo-placeholder"
          className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--chat-surface-hover)]"
        >
          <MapPinned
            className="size-5 text-[color:var(--chat-text-secondary)]"
            aria-hidden="true"
          />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[color:var(--chat-text-primary)]">
          {place.name}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-[color:var(--chat-text-secondary)]">
          {rating ? (
            <>
              <Star
                className="size-3 shrink-0 text-[color:var(--chat-warning)]"
                fill="currentColor"
                aria-hidden="true"
              />
              <span className="font-medium text-[color:var(--chat-text-primary)]">{rating}</span>
              {reviews ? <span className="shrink-0">{reviews}</span> : null}
            </>
          ) : null}
          {summary ? <span className="truncate">{summary}</span> : null}
        </span>
        {open ? (
          <span
            className={cn(
              'mt-0.5 block text-xs font-medium',
              place.openNow ? 'text-success-text' : 'text-[color:var(--chat-text-secondary)]',
            )}
          >
            {open}
          </span>
        ) : null}
      </span>
    </button>
  );
}
