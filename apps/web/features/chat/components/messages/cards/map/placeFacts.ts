import type { PlacePriceLevel, PlacesCardPlace } from '@agiworkforce/types';

const PRICE_LEVEL_LABELS: Record<PlacePriceLevel, string> = {
  free: 'Free',
  inexpensive: '$',
  moderate: '$$',
  expensive: '$$$',
  very_expensive: '$$$$',
};

export const OPEN_NOW_LABEL = 'Open';
export const CLOSED_NOW_LABEL = 'Closed';

const RATING_FRACTION_DIGITS = 1;

export function priceLevelLabel(level: PlacePriceLevel | undefined): string | null {
  return level ? PRICE_LEVEL_LABELS[level] : null;
}

export function ratingLabel(rating: number | undefined): string | null {
  return rating === undefined ? null : rating.toFixed(RATING_FRACTION_DIGITS);
}

export function reviewCountLabel(reviewCount: number | undefined): string | null {
  if (reviewCount === undefined) return null;
  return `(${reviewCount.toLocaleString()})`;
}

export function openNowLabel(openNow: boolean | undefined): string | null {
  if (openNow === undefined) return null;
  return openNow ? OPEN_NOW_LABEL : CLOSED_NOW_LABEL;
}

export function placeMarkerName(place: PlacesCardPlace): string {
  const rating = ratingLabel(place.rating);
  return rating === null ? place.name : `${place.name}, rated ${rating} out of 5`;
}

export function placeSummaryLine(place: PlacesCardPlace): string {
  return [priceLevelLabel(place.priceLevel), place.category]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}
