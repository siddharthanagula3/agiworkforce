import 'server-only';

import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  PLACES_CARD_MAX_PHOTOS_PER_PLACE,
  PLACES_CARD_MAX_PLACES,
  PLACES_SEARCH_TOOL_NAME,
  type InteractiveCard,
  type PlaceRecord,
  type PlacesCardBody,
  type PlacesCardPlace,
  type PlacesSearchPayload,
} from '@agiworkforce/types';

export const PLACES_CARD_KIND = 'places.v1';

const CARD_FALLBACK_HEADLINE_PREFIX = 'Places for';
const NO_PLACES_FALLBACK = 'No places matched this search.';

function hasCoordinates(place: PlaceRecord): place is LocatedPlace {
  return typeof place.latitude === 'number' && typeof place.longitude === 'number';
}

type LocatedPlace = PlaceRecord & { latitude: number; longitude: number };

function toCardPlace(place: LocatedPlace, photoLimit: number): PlacesCardPlace {
  const photos = (place.photos ?? []).slice(0, photoLimit).map((photo) => ({
    reference: photo.reference,
    ...(photo.attribution ? { attribution: photo.attribution } : {}),
  }));

  return {
    placeId: place.placeId,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    ...(place.address ? { address: place.address } : {}),
    ...(place.rating !== undefined ? { rating: place.rating } : {}),
    ...(place.reviewCount !== undefined ? { reviewCount: place.reviewCount } : {}),
    ...(place.category ? { category: place.category } : {}),
    ...(place.priceLevel ? { priceLevel: place.priceLevel } : {}),
    ...(place.openNow !== undefined ? { openNow: place.openNow } : {}),
    ...(place.mapsUrl ? { directionsUrl: place.mapsUrl } : {}),
    ...(place.website ? { websiteUrl: place.website } : {}),
    ...(photos.length > 0 ? { photos } : {}),
  };
}

function fallbackText(payload: PlacesSearchPayload): string {
  if (payload.places.length === 0) return NO_PLACES_FALLBACK;
  return payload.places
    .map((place, index) => {
      const facts = [
        place.rating !== undefined ? `rated ${place.rating}` : null,
        place.category ?? null,
        place.address ?? null,
      ].filter((fact): fact is string => fact !== null);
      return `${index + 1}. ${place.name}${facts.length > 0 ? ` (${facts.join(', ')})` : ''}`;
    })
    .join('\n');
}

function cardBody(payload: PlacesSearchPayload, photoLimit: number): PlacesCardBody {
  return {
    query: payload.query,
    ...(payload.near ? { near: payload.near } : {}),
    openNowRequested: payload.openNowRequested,
    ...(payload.localTime ? { localTime: payload.localTime } : {}),
    attribution: payload.attribution,
    ...(payload.termsUrl ? { termsUrl: payload.termsUrl } : {}),
    places: payload.places
      .filter(hasCoordinates)
      .slice(0, PLACES_CARD_MAX_PLACES)
      .map((place) => toCardPlace(place, photoLimit)),
  };
}

/**
 * The envelope has a hard serialized budget, and photo references are the only
 * unbounded part of a place. Names, ratings and addresses are what the card is
 * for, so photos are what gives way: drop one per place at a time until the
 * card fits rather than truncating the list of places.
 */
export function buildPlacesCard(
  payload: PlacesSearchPayload,
  context: { toolCallId: string; now?: () => Date },
): InteractiveCard | null {
  const createdAt = (context.now ?? (() => new Date()))().toISOString();
  const scope = payload.near ? `${payload.query} near ${payload.near}` : payload.query;

  for (let photoLimit = PLACES_CARD_MAX_PHOTOS_PER_PLACE; photoLimit >= 0; photoLimit--) {
    const rawCard = {
      schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
      cardId: context.toolCallId,
      kind: PLACES_CARD_KIND,
      createdAt,
      fallback: {
        headline: `${CARD_FALLBACK_HEADLINE_PREFIX} ${scope}`,
        text: fallbackText(payload),
      },
      producedBy: { toolCallId: context.toolCallId, toolName: PLACES_SEARCH_TOOL_NAME },
      body: cardBody(payload, photoLimit),
    };

    if (JSON.stringify(rawCard).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) continue;

    const card = parseInteractiveCardDelta({ card: rawCard });
    if (card?.recognized && card.kind === PLACES_CARD_KIND) return card;
  }

  return null;
}
