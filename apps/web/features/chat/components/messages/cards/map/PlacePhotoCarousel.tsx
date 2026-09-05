'use client';

import { useEffect, useState } from 'react';
import type { PlacesCardPhoto } from '@agiworkforce/types';
import { placePhotoUrl, PLACE_PHOTO_DETAIL_WIDTH_PX } from '@/lib/maps/place-photo-url';
import { cn } from '@shared/lib/utils';

interface PlacePhotoCarouselProps {
  photos: readonly PlacesCardPhoto[];
  placeName: string;
}

export function PlacePhotoCarousel({ photos, placeName }: PlacePhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setIndex(0);
  }, [placeName]);

  const current = photos[index];
  if (!current || failed[current.reference]) return null;

  return (
    <div className="relative">
      <img
        src={placePhotoUrl(current.reference, PLACE_PHOTO_DETAIL_WIDTH_PX)}
        alt={`Photo of ${placeName}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed((state) => ({ ...state, [current.reference]: true }))}
        className="h-24 w-full bg-[var(--chat-surface-hover)] object-cover"
      />
      {current.attribution ? (
        <span className="absolute bottom-1 right-1 max-w-[70%] truncate rounded bg-[var(--chat-surface-overlay)] px-1.5 py-0.5 text-xs text-[color:var(--chat-text-secondary)]">
          {current.attribution}
        </span>
      ) : null}
      {photos.length > 1 ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.reference}
              type="button"
              onClick={() => setIndex(photoIndex)}
              aria-label={`Show photo ${photoIndex + 1} of ${photos.length}`}
              aria-current={photoIndex === index}
              className="grid size-7 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 rounded-full border border-[var(--chat-border-strong)] transition-colors',
                  photoIndex === index
                    ? 'bg-[var(--chat-accent-primary)]'
                    : 'bg-[var(--chat-surface-elevated)]',
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
