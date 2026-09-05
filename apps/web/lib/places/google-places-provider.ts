import 'server-only';

import {
  PLACE_PRICE_LEVELS,
  PLACES_SEARCH_MAX_LIMIT,
  PLACES_SEARCH_MIN_LIMIT,
  type PlacePhoto,
  type PlacePriceLevel,
  type PlaceRecord,
} from '@agiworkforce/types';

import {
  assertResolvedPublicHostname,
  EgressPolicyError,
  pinnedPublicFetch,
  validateEgressUrl,
} from '@/lib/egress-policy';
import {
  PLACES_API_KEY_ENV,
  PLACES_SEARCH_TIMEOUT_MS,
  placesApiKey,
} from '@/lib/places/places-config';
import {
  placesError,
  type PlacesProvider,
  type PlacesSearchOutcome,
  type PlacesSearchQuery,
} from '@/lib/places/places-provider';

const GOOGLE_PLACES_PROVIDER_ID = 'google_places';
const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_ATTRIBUTION = 'Powered by Google';

const API_KEY_HEADER = 'X-Goog-Api-Key';
const FIELD_MASK_HEADER = 'X-Goog-FieldMask';

const RESPONSE_FIELDS: readonly string[] = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.priceLevel',
  'places.currentOpeningHours.openNow',
  'places.currentOpeningHours.weekdayDescriptions',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.photos.name',
  'places.photos.widthPx',
  'places.photos.heightPx',
  'places.photos.authorAttributions',
];

const GOOGLE_PRICE_LEVEL_PREFIX = 'PRICE_LEVEL_';

const PRICE_LEVEL_BY_WIRE_VALUE: ReadonlyMap<string, PlacePriceLevel> = new Map(
  PLACE_PRICE_LEVELS.map((level) => [`${GOOGLE_PRICE_LEVEL_PREFIX}${level.toUpperCase()}`, level]),
);

const MAX_ERROR_BODY_LENGTH = 500;

interface GoogleLocalizedText {
  text?: unknown;
}

interface GoogleOpeningHours {
  openNow?: unknown;
  weekdayDescriptions?: unknown;
}

interface GoogleAuthorAttribution {
  displayName?: unknown;
}

interface GooglePhoto {
  name?: unknown;
  widthPx?: unknown;
  heightPx?: unknown;
  authorAttributions?: unknown;
}

interface GooglePlaceWire {
  id?: unknown;
  displayName?: GoogleLocalizedText;
  formattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
  rating?: unknown;
  userRatingCount?: unknown;
  primaryTypeDisplayName?: GoogleLocalizedText;
  priceLevel?: unknown;
  currentOpeningHours?: GoogleOpeningHours;
  regularOpeningHours?: GoogleOpeningHours;
  nationalPhoneNumber?: unknown;
  websiteUri?: unknown;
  googleMapsUri?: unknown;
  photos?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function localizedText(value: GoogleLocalizedText | undefined): string | undefined {
  return text(value?.text);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.map(text).filter((entry): entry is string => entry !== undefined);
  return entries.length > 0 ? entries : undefined;
}

function httpsUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    return new URL(candidate).protocol === 'https:' ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function photoAttribution(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .map(
      (entry) =>
        localizedText(entry as GoogleLocalizedText) ??
        text((entry as GoogleAuthorAttribution)?.displayName),
    )
    .filter((entry): entry is string => entry !== undefined);
  return names.length > 0 ? names.join(', ') : undefined;
}

function toPhotos(value: unknown): PlacePhoto[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const photos: PlacePhoto[] = [];
  for (const entry of value as GooglePhoto[]) {
    const reference = text(entry?.name);
    if (!reference) continue;
    const widthPx = finiteNumber(entry?.widthPx);
    const heightPx = finiteNumber(entry?.heightPx);
    const attribution = photoAttribution(entry?.authorAttributions);
    photos.push({
      reference,
      ...(widthPx !== undefined ? { widthPx } : {}),
      ...(heightPx !== undefined ? { heightPx } : {}),
      ...(attribution ? { attribution } : {}),
    });
  }
  return photos.length > 0 ? photos : undefined;
}

export function normalizeGooglePlace(wire: GooglePlaceWire): PlaceRecord | null {
  const placeId = text(wire.id);
  const name = localizedText(wire.displayName);
  if (!placeId || !name) return null;

  const openingHours = wire.currentOpeningHours ?? wire.regularOpeningHours;
  const address = text(wire.formattedAddress);
  const rating = finiteNumber(wire.rating);
  const reviewCount = finiteNumber(wire.userRatingCount);
  const category = localizedText(wire.primaryTypeDisplayName);
  const priceLevel = PRICE_LEVEL_BY_WIRE_VALUE.get(text(wire.priceLevel) ?? '');
  const openNow =
    typeof wire.currentOpeningHours?.openNow === 'boolean'
      ? wire.currentOpeningHours.openNow
      : undefined;
  const hours =
    stringList(wire.currentOpeningHours?.weekdayDescriptions) ??
    stringList(openingHours?.weekdayDescriptions);
  const phone = text(wire.nationalPhoneNumber);
  const website = httpsUrl(wire.websiteUri);
  const mapsUrl = httpsUrl(wire.googleMapsUri);
  const latitude = finiteNumber(wire.location?.latitude);
  const longitude = finiteNumber(wire.location?.longitude);
  const photos = toPhotos(wire.photos);

  return {
    placeId,
    name,
    ...(address ? { address } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(reviewCount !== undefined ? { reviewCount } : {}),
    ...(category ? { category } : {}),
    ...(priceLevel ? { priceLevel } : {}),
    ...(openNow !== undefined ? { openNow } : {}),
    ...(hours ? { hours } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(mapsUrl ? { mapsUrl } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...(photos ? { photos } : {}),
  };
}

export function buildGoogleTextQuery(request: PlacesSearchQuery): string {
  const near = request.near?.trim();
  if (!near) return request.query;
  return new RegExp(`\\b${near.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'iu').test(
    request.query,
  )
    ? request.query
    : `${request.query} near ${near}`;
}

export interface GooglePlacesProviderOverrides {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
}

export function createGooglePlacesProvider(
  overrides: GooglePlacesProviderOverrides = {},
): PlacesProvider {
  const resolveKey = (): string | undefined => overrides.apiKey ?? placesApiKey();

  return {
    id: GOOGLE_PLACES_PROVIDER_ID,
    attribution: GOOGLE_PLACES_ATTRIBUTION,
    configured: () => resolveKey() !== undefined,
    async search(request: PlacesSearchQuery): Promise<PlacesSearchOutcome> {
      if (request.signal?.aborted) {
        return placesError(GOOGLE_PLACES_PROVIDER_ID, 'cancelled', 'The request was cancelled.');
      }

      const apiKey = resolveKey();
      if (!apiKey) {
        return placesError(
          GOOGLE_PLACES_PROVIDER_ID,
          'not_configured',
          `Places search is not configured on this server (missing ${PLACES_API_KEY_ENV}).`,
        );
      }

      try {
        validateEgressUrl(GOOGLE_PLACES_TEXT_SEARCH_URL);
        await assertResolvedPublicHostname(GOOGLE_PLACES_TEXT_SEARCH_URL);
      } catch (guardErr) {
        if (guardErr instanceof EgressPolicyError) {
          return placesError(
            GOOGLE_PLACES_PROVIDER_ID,
            'upstream_error',
            'The places provider host is not reachable under the egress policy.',
          );
        }
        throw guardErr;
      }

      const pageSize = Math.max(
        PLACES_SEARCH_MIN_LIMIT,
        Math.min(request.limit, PLACES_SEARCH_MAX_LIMIT),
      );
      const timeoutMs = overrides.timeoutMs ?? PLACES_SEARCH_TIMEOUT_MS;
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), timeoutMs);
      const cancel = (): void => controller.abort();
      request.signal?.addEventListener('abort', cancel, { once: true });

      try {
        const fetchImpl = overrides.fetchImpl ?? pinnedPublicFetch;
        let response: Response;
        try {
          response = await fetchImpl(GOOGLE_PLACES_TEXT_SEARCH_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              [API_KEY_HEADER]: apiKey,
              [FIELD_MASK_HEADER]: RESPONSE_FIELDS.join(','),
            },
            body: JSON.stringify({
              textQuery: buildGoogleTextQuery(request),
              pageSize,
              ...(request.openNow === true ? { openNow: true } : {}),
              ...(request.languageCode ? { languageCode: request.languageCode } : {}),
            }),
          });
        } catch (fetchErr) {
          if (request.signal?.aborted) {
            return placesError(
              GOOGLE_PLACES_PROVIDER_ID,
              'cancelled',
              'The request was cancelled.',
            );
          }
          if (controller.signal.aborted) {
            return placesError(
              GOOGLE_PLACES_PROVIDER_ID,
              'timeout',
              `Places search timed out after ${timeoutMs}ms.`,
            );
          }
          const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          return placesError(
            GOOGLE_PLACES_PROVIDER_ID,
            'upstream_error',
            `Places search request failed: ${message}`,
          );
        }

        if (!response.ok) {
          let body = '';
          try {
            body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
          } catch {
            body = '';
          }
          return {
            ok: false,
            providerId: GOOGLE_PLACES_PROVIDER_ID,
            errorCode: 'upstream_error',
            error: `The places provider returned HTTP ${response.status}${body ? `: ${body}` : ''}.`,
            billableCalls: 1,
          };
        }

        let parsed: { places?: unknown };
        try {
          parsed = (await response.json()) as { places?: unknown };
        } catch (parseErr) {
          const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
          return {
            ok: false,
            providerId: GOOGLE_PLACES_PROVIDER_ID,
            errorCode: 'upstream_error',
            error: `Failed to parse the places provider response: ${message}`,
            billableCalls: 1,
          };
        }

        const wirePlaces = Array.isArray(parsed.places) ? (parsed.places as GooglePlaceWire[]) : [];
        const places: PlaceRecord[] = [];
        for (const wire of wirePlaces) {
          if (places.length >= pageSize) break;
          const place = normalizeGooglePlace(wire);
          if (place) places.push(place);
        }

        return {
          ok: true,
          providerId: GOOGLE_PLACES_PROVIDER_ID,
          attribution: GOOGLE_PLACES_ATTRIBUTION,
          places,
          billableCalls: 1,
        };
      } finally {
        clearTimeout(deadline);
        request.signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
