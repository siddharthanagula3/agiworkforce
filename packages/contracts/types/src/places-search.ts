/**
 * Places search contract.
 *
 * The tool name and its bounds are shared because both halves of the feature
 * read them: the server registers and executes the tool, and the client maps
 * the same name to its activity label and, later, to its result card.
 *
 * @module places-search
 * @packageDocumentation
 */

export const PLACES_SEARCH_TOOL_NAME = 'search_places';

export const PLACES_SEARCH_QUERY_MAX_LENGTH = 300;
export const PLACES_SEARCH_NEAR_MAX_LENGTH = 160;
export const PLACES_SEARCH_MIN_LIMIT = 1;
export const PLACES_SEARCH_DEFAULT_LIMIT = 5;
export const PLACES_SEARCH_MAX_LIMIT = 10;

export const PLACE_PRICE_LEVELS = [
  'free',
  'inexpensive',
  'moderate',
  'expensive',
  'very_expensive',
] as const;

export type PlacePriceLevel = (typeof PLACE_PRICE_LEVELS)[number];

export interface PlacePhoto {
  reference: string;
  widthPx?: number;
  heightPx?: number;
  attribution?: string;
}

export interface PlaceRecord {
  placeId: string;
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: PlacePriceLevel;
  openNow?: boolean;
  hours?: string[];
  phone?: string;
  website?: string;
  mapsUrl?: string;
  latitude?: number;
  longitude?: number;
  photos?: PlacePhoto[];
}

export interface PlacesSearchPayload {
  query: string;
  near?: string;
  openNowRequested: boolean;
  /**
   * The instant the search ran, rendered in the user's own zone. Carried so an
   * answer about what is open states the time it was true for instead of
   * guessing the time of day.
   */
  localTime?: string;
  timeZone?: string;
  providerId: string;
  attribution: string;
  termsUrl?: string;
  places: PlaceRecord[];
}
