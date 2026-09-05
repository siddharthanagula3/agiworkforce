/**
 * Place intent in the user's own words.
 *
 * Sibling of {@link module:search/explicit-search-intent}: that one answers
 * "did the user ask for a web search", this one answers "is this a question
 * about real places". A place question is not a search request, it needs
 * ratings, hours and an address rather than pages, and both leaders answer it
 * with a dedicated tool triggered by wording rather than by a menu.
 *
 * Every phrase lives here so a new phrasing is a one-line change with a test
 * rather than an edit inside a request pipeline.
 *
 * @module search/place-intent
 * @packageDocumentation
 */

const PROXIMITY_PHRASES: readonly string[] = [
  'near me',
  'near here',
  'nearby',
  'near by',
  'around here',
  'around me',
  'close to me',
  'closest',
  'nearest',
  'walking distance',
  'walk from here',
  'in this area',
  'in the area',
  'in my area',
  'around the corner',
];

const OPEN_NOW_PHRASES: readonly string[] = [
  'open now',
  'open right now',
  'still open',
  'open late',
  'open today',
  'open tonight',
  'currently open',
  'open at this hour',
  'open until',
  'closing time',
  'what time do they close',
  'what time does it close',
];

const WAYFINDING_PHRASES: readonly string[] = [
  'directions to',
  'directions from',
  'how do i get to',
  'how do we get to',
  'how far is',
  'address of',
  'address for',
  'phone number for',
  'opening hours',
  'hours for',
  'is it open',
  'are they open',
  'book a table',
  'reservation at',
  'reservations at',
];

const PLACE_CATEGORY_PHRASES: readonly string[] = [
  'restaurant',
  'restaurants',
  'cafe',
  'cafes',
  'coffee shop',
  'coffee shops',
  'coffee',
  'espresso bar',
  'bakery',
  'bakeries',
  'bar',
  'bars',
  'pub',
  'pubs',
  'brewery',
  'breweries',
  'hotel',
  'hotels',
  'motel',
  'motels',
  'hostel',
  'hostels',
  'pharmacy',
  'pharmacies',
  'drugstore',
  'grocery store',
  'supermarket',
  'gas station',
  'petrol station',
  'charging station',
  'atm',
  'gym',
  'gyms',
  'museum',
  'museums',
  'bookstore',
  'bookshop',
  'barber',
  'hair salon',
  'nail salon',
  'laundromat',
  'hardware store',
  'urgent care',
  'walk in clinic',
  'dentist',
  'doctors office',
  'hospital',
  'veterinarian',
  'car wash',
  'dog park',
  'playground',
  'places to eat',
  'place to eat',
  'where to eat',
  'where to stay',
  'things to do',
  'brunch spot',
  'dinner spot',
  'lunch spot',
  'food near',
  'takeout',
  'sushi',
  'pizza',
  'ramen',
  'tacos',
  'bbq',
];

function escapeForPattern(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhrasePattern(phrases: readonly string[]): RegExp {
  const alternation = phrases
    .map(escapeForPattern)
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternation})(?![\\p{L}\\p{N}_])`, 'iu');
}

const PROXIMITY_PATTERN = buildPhrasePattern(PROXIMITY_PHRASES);
const OPEN_NOW_PATTERN = buildPhrasePattern(OPEN_NOW_PHRASES);
const WAYFINDING_PATTERN = buildPhrasePattern(WAYFINDING_PHRASES);
const PLACE_CATEGORY_PATTERN = buildPhrasePattern(PLACE_CATEGORY_PHRASES);

/**
 * A proper noun behind a locality preposition. Case-sensitive on purpose: the
 * capital is the only signal available without a gazetteer that "in Austin" is
 * a place and "in advance" is not.
 */
const LOCALITY_PATTERN = /\b(?:near|in|around|at|by)\s+(?:the\s+)?\p{Lu}\p{L}/u;

/** "near <somewhere named>" is proximity even when the phrase list has no entry for it. */
const NEAR_PROPER_NOUN_PATTERN = /\bnear\s+(?:the\s+)?\p{Lu}\p{L}/u;

export type PlaceIntentSignal = 'wayfinding' | 'proximity' | 'open_now' | 'locality';

export const PLACE_INTENT_PHRASES: Readonly<Record<string, readonly string[]>> = {
  proximity: PROXIMITY_PHRASES,
  open_now: OPEN_NOW_PHRASES,
  wayfinding: WAYFINDING_PHRASES,
  category: PLACE_CATEGORY_PHRASES,
};

/**
 * The signal this text carries, or `null` when it carries none. Returning the
 * signal rather than a boolean keeps the reason auditable and lets the caller
 * separate the signals strong enough to require the tool from the one that
 * only earns an offer.
 */
export function detectPlaceIntent(text: string): PlaceIntentSignal | null {
  if (!text) return null;

  const category = PLACE_CATEGORY_PATTERN.test(text);
  if (WAYFINDING_PATTERN.test(text)) return 'wayfinding';
  if (PROXIMITY_PATTERN.test(text) || NEAR_PROPER_NOUN_PATTERN.test(text)) return 'proximity';
  if (OPEN_NOW_PATTERN.test(text) && (category || LOCALITY_PATTERN.test(text))) return 'open_now';
  if (category && LOCALITY_PATTERN.test(text)) return 'locality';
  return null;
}

export function hasPlaceIntent(text: string): boolean {
  return detectPlaceIntent(text) !== null;
}

/**
 * `locality` is a category word beside any capitalised noun, which also
 * describes "how do I brew coffee in Italy". It is offered, never forced: the
 * model decides. The other three name a place question outright.
 */
export function placeIntentForcesPlacesSearch(signal: PlaceIntentSignal | null): boolean {
  return signal === 'wayfinding' || signal === 'proximity' || signal === 'open_now';
}
