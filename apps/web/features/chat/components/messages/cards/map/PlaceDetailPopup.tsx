'use client';

import { useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Navigation,
  Star,
  X,
} from '@agiworkforce/icons';
import type { PlacesCardPlace } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { MapPinned } from '@agiworkforce/icons';
import { PlacePhotoCarousel } from './PlacePhotoCarousel';
import { openNowLabel, placeSummaryLine, ratingLabel, reviewCountLabel } from './placeFacts';

export const ASSISTANT_NOTE_HEADING = 'About, from this answer';

interface PlaceDetailPopupProps {
  place: PlacesCardPlace;
  index: number;
  total: number;
  note: string | null;
  attribution: string;
  termsUrl: string | undefined;
  onClose: () => void;
  onStep: (delta: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function PlaceDetailPopup({
  place,
  index,
  total,
  note,
  attribution,
  termsUrl,
  onClose,
  onStep,
  className,
  style,
}: PlaceDetailPopupProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const rating = ratingLabel(place.rating);
  const reviews = reviewCountLabel(place.reviewCount);
  const open = openNowLabel(place.openNow);
  const summary = placeSummaryLine(place);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    const panel = panelRef.current;
    panel?.focus();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={place.name}
      tabIndex={-1}
      data-testid="places-detail-popup"
      style={style}
      className={cn(
        'flex w-72 max-w-full flex-col overflow-hidden rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] shadow-lg focus:outline-none',
        className,
      )}
    >
      <div className="shrink-0">
        {place.photos && place.photos.length > 0 ? (
          <PlacePhotoCarousel photos={place.photos} placeName={place.name} />
        ) : (
          <div
            data-testid="places-photo-placeholder"
            className="grid h-24 place-items-center bg-[var(--chat-surface-hover)]"
          >
            <MapPinned
              className="size-6 text-[color:var(--chat-text-secondary)]"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-start justify-between gap-2 px-3 pb-1 pt-2.5">
        <h3 className="text-sm font-semibold text-[color:var(--chat-text-primary)]">
          {place.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close place details"
          className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-[color:var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* The middle scrolls; the name and the pagination are chrome and stay
          put, so a tall note never hides which place of how many this is. */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-2">
        {rating ? (
          <p className="flex items-center gap-1.5 text-sm text-[color:var(--chat-text-secondary)]">
            <Star
              className="size-3.5 text-[color:var(--chat-warning)]"
              fill="currentColor"
              aria-hidden="true"
            />
            <span className="font-medium text-[color:var(--chat-text-primary)]">{rating}</span>
            {reviews ? <span>{reviews}</span> : null}
            {open ? (
              <span
                className={cn(
                  'font-medium',
                  place.openNow ? 'text-success-text' : 'text-[color:var(--chat-text-secondary)]',
                )}
              >
                {open}
              </span>
            ) : null}
          </p>
        ) : null}

        {summary ? (
          <p className="text-sm text-[color:var(--chat-text-secondary)]">{summary}</p>
        ) : null}

        {place.directionsUrl || place.websiteUrl ? (
          <div className="flex flex-wrap gap-2">
            {place.directionsUrl ? (
              <a
                href={place.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[var(--chat-accent-primary)] px-2.5 text-sm font-medium text-[color:var(--chat-accent-on-primary)] transition-opacity hover:opacity-90"
              >
                <Navigation className="size-3.5" aria-hidden="true" />
                Directions
              </a>
            ) : null}
            {place.websiteUrl ? (
              <a
                href={place.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[var(--chat-border)] px-2.5 text-sm font-medium text-[color:var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
              >
                <Globe className="size-3.5" aria-hidden="true" />
                Website
              </a>
            ) : null}
          </div>
        ) : null}

        {place.address ? (
          <p className="text-sm text-[color:var(--chat-text-secondary)]">{place.address}</p>
        ) : null}

        {note ? (
          <div className="rounded-lg bg-[var(--chat-surface-hover)] p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--chat-text-secondary)]">
              {ASSISTANT_NOTE_HEADING}
            </p>
            <p className="mt-1 text-sm text-[color:var(--chat-text-primary)]">{note}</p>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--chat-border-subtle)] px-3 py-1.5">
        {/* The attribution may give way to an ellipsis; the terms link may not,
            so it sits outside the truncating span. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-[color:var(--chat-text-muted)]">
          <span className="min-w-0 truncate">{attribution}</span>
          {termsUrl ? (
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-0.5 underline underline-offset-2"
            >
              Terms
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : null}
        </span>
        {total > 1 ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label="Previous place"
              className="grid size-7 place-items-center rounded-md text-[color:var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="text-xs tabular-nums text-[color:var(--chat-text-secondary)]">
              {index + 1} of {total}
            </span>
            <button
              type="button"
              onClick={() => onStep(1)}
              aria-label="Next place"
              className="grid size-7 place-items-center rounded-md text-[color:var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
