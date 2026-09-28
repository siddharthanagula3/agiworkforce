import 'server-only';

import { z } from 'zod';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  ITINERARY_MAX_STOPS,
  ITINERARY_NOTE_MAX_LENGTH,
  ITINERARY_STOPS_PER_ROUTE_LEG,
  ITINERARY_TOOL_NAME,
  PLACES_SEARCH_NEAR_MAX_LENGTH,
  PLACES_SEARCH_QUERY_MAX_LENGTH,
  isValidIanaTimeZone,
  type InteractiveCard,
  type ItineraryCardBody,
  type ItineraryRoute,
  type ItineraryStop,
  type ItineraryTravelMode,
  type PlaceIdentity,
  type PlaceRecord,
} from '@agiworkforce/types';

import {
  createGooglePlacesProvider,
  GOOGLE_PLACES_PROVIDER_ID,
} from '@/lib/places/google-places-provider';
import {
  reservePlacesSearchCharge,
  settlePlacesSearchCall,
  type PlacesSearchBilling,
} from '@/lib/places/places-cost';
import type { PlacesProvider, PlacesSearchOutcome } from '@/lib/places/places-provider';
import { INCLUDED_SEARCH_ADMISSION, type SearchAdmission } from '@/lib/web-search/search-budget';

export const ITINERARY_CARD_KIND = 'itinerary.v1';

const TRAVEL_MODES = [
  'walking',
  'driving',
  'transit',
  'bicycling',
] as const satisfies readonly ItineraryTravelMode[];
const DEFAULT_TRAVEL_MODE: ItineraryTravelMode = 'walking';
const DEFAULT_TIME_ZONE = 'UTC';
const TITLE_MAX_LENGTH = 200;
const SUMMARY_MAX_LENGTH = 2_000;
const REGION_LABEL_MAX_LENGTH = 200;
const TIME_LABEL_MAX_LENGTH = 24;
const PLACE_NAME_MAX_LENGTH = 200;
const PLACE_ADDRESS_MAX_LENGTH = 500;
const DIRECTIONS_URL = 'https://www.google.com/maps/dir/';
const FULL_ROUTE_LABEL = 'Full route';
const NOTE_BUDGETS = [ITINERARY_NOTE_MAX_LENGTH, 120, 0] as const;
const SUMMARY_BUDGETS = [SUMMARY_MAX_LENGTH, 600, 200] as const;

const ITINERARY_PHRASE_RE =
  /\b(?:itinerar(?:y|ies)|day[\s-]trips?|road[\s-]trips?|walking tours?|sightseeing|travel plans?|trip plans?|plan (?:a|my|our|the) (?:trip|day|weekend|route|vacation|holiday|visit)|places to visit|things to see)\b/i;
const DAYS_IN_PLACE_RE =
  /\b(?:[Aa]|[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|\d{1,2})[\s-](?:days?|nights?|weekends?)\s+in\s+(?:the\s+)?\p{Lu}/u;

export function isItineraryTool(name: string): boolean {
  return name === ITINERARY_TOOL_NAME;
}

export function asksForItinerary(message: string): boolean {
  return ITINERARY_PHRASE_RE.test(message) || DAYS_IN_PLACE_RE.test(message);
}

function clipped(max: number) {
  return z
    .string()
    .trim()
    .transform((value) => value.slice(0, max));
}

const ItineraryInputSchema = z.object({
  title: clipped(TITLE_MAX_LENGTH).pipe(z.string().min(1)),
  summary: clipped(SUMMARY_MAX_LENGTH).default(''),
  region: z
    .object({
      label: clipped(REGION_LABEL_MAX_LENGTH).optional(),
      timeZone: z.string().trim().optional(),
    })
    .optional(),
  travelMode: z.enum(TRAVEL_MODES).default(DEFAULT_TRAVEL_MODE),
  stops: z
    .array(
      z.object({
        startTimeLabel: clipped(TIME_LABEL_MAX_LENGTH).default(''),
        note: clipped(ITINERARY_NOTE_MAX_LENGTH).default(''),
        placeQuery: z.string().trim().min(1).max(PLACES_SEARCH_QUERY_MAX_LENGTH),
        localityHint: clipped(PLACES_SEARCH_NEAR_MAX_LENGTH).default(''),
      }),
    )
    .min(1)
    .max(ITINERARY_MAX_STOPS),
});

type ItineraryInput = z.infer<typeof ItineraryInputSchema>;

export function itineraryToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: ITINERARY_TOOL_NAME,
      description:
        'Show a trip plan as an itinerary card: the stops in visiting order, numbered on a map, with a route between them the user can open in Google Maps. Use it when the user asks for an itinerary, a day trip, a walking tour or a plan for visiting a place. Give every stop as a real venue, landmark or address to look up, not an activity, with the town or city to search in, a short start time such as 9:00 or Morning, and one line on why to go. Do not use it for a single place or for recommendations that have no order.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            maxLength: TITLE_MAX_LENGTH,
            description: 'A short title, such as One day in Rome.',
          },
          summary: {
            type: 'string',
            maxLength: SUMMARY_MAX_LENGTH,
            description: 'Two or three sentences on the shape of the plan.',
          },
          region: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                maxLength: REGION_LABEL_MAX_LENGTH,
                description: 'Where the trip happens, such as Rome, Italy.',
              },
              timeZone: {
                type: 'string',
                description: 'The IANA time zone of that place, such as Europe/Rome.',
              },
            },
            required: ['label', 'timeZone'],
            additionalProperties: false,
          },
          travelMode: {
            type: 'string',
            enum: [...TRAVEL_MODES],
            description: 'How the traveller gets between stops.',
          },
          stops: {
            type: 'array',
            minItems: 1,
            maxItems: ITINERARY_MAX_STOPS,
            items: {
              type: 'object',
              properties: {
                startTimeLabel: {
                  type: 'string',
                  maxLength: TIME_LABEL_MAX_LENGTH,
                  description: 'When to arrive, such as 9:00, Morning or Day 2.',
                },
                note: {
                  type: 'string',
                  maxLength: ITINERARY_NOTE_MAX_LENGTH,
                  description: 'One line on why to go or what to do there.',
                },
                placeQuery: {
                  type: 'string',
                  maxLength: PLACES_SEARCH_QUERY_MAX_LENGTH,
                  description: 'The place to look up, such as Colosseum or Trattoria Da Enzo.',
                },
                localityHint: {
                  type: 'string',
                  maxLength: PLACES_SEARCH_NEAR_MAX_LENGTH,
                  description: 'The town or city to search in, such as Rome, Italy.',
                },
              },
              required: ['placeQuery', 'localityHint'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'region', 'travelMode', 'stops'],
        additionalProperties: false,
      },
    },
  };
}

export type ItineraryToolOutcome =
  | { ok: true; content: string; card: InteractiveCard }
  | { ok: false; content: string; unaffordable?: boolean };

export interface ItineraryExecutionContext {
  toolCallId: string;
  timeZone?: string | undefined;
  signal?: AbortSignal | undefined;
  now?: () => Date;
  provider?: PlacesProvider;
  billing?: PlacesSearchBilling;
}

const INVALID_INPUT_MESSAGE =
  `${ITINERARY_TOOL_NAME} needs a title, a region, a travel mode and between 1 and ` +
  `${ITINERARY_MAX_STOPS} stops, each with a placeQuery and a localityHint.`;

const UNAVAILABLE_MESSAGE =
  'The itinerary card is unavailable: this server has no places provider configured. Write ' +
  'the plan as text, and do not present remembered addresses or opening hours as checked.';

const UNAFFORDABLE_MESSAGE =
  'The itinerary card is unavailable on this account right now: each stop is looked up as a ' +
  'charged places search and the account has no credits left for them. Write the plan as ' +
  'text, and tell the user their credit balance is what stopped the lookups.';

const LOOKUP_FAILED_MESSAGE =
  'The itinerary card is unavailable: the places provider did not answer, so no stop could be ' +
  'looked up. Write the plan as text, and do not present remembered addresses or opening ' +
  'hours as checked.';

const TOO_LARGE_MESSAGE =
  'The itinerary did not fit in one card. Split it into shorter plans, such as one per day.';

const BOOKING_GUIDANCE =
  'If the user wants to book a stay, a flight, a table or a tour for this trip, use the tools ' +
  'of a travel or booking connector when this chat offers them. If none is offered, tell the ' +
  'user they can connect one in Settings, under Connectors, and then book from this chat.';

interface Lookup {
  query: string;
  near: string;
}

type ResolvedPlace = Extract<PlaceIdentity, { status: 'resolved' }>;

function lookupKey(stop: ItineraryInput['stops'][number]): string {
  return `${stop.placeQuery.toLowerCase()}\u0000${stop.localityHint.toLowerCase()}`;
}

function located(
  place: PlaceRecord,
): place is PlaceRecord & { latitude: number; longitude: number } {
  return typeof place.latitude === 'number' && typeof place.longitude === 'number';
}

function toIdentity(
  lookup: Lookup,
  outcome: PlacesSearchOutcome,
  resolvedAt: string,
): PlaceIdentity {
  if (!outcome.ok) return { status: 'unresolved', query: lookup.query, reason: 'provider_error' };
  const place = outcome.places.find(located);
  if (!place) return { status: 'unresolved', query: lookup.query, reason: 'no_match' };
  const displayName = place.name.slice(0, PLACE_NAME_MAX_LENGTH);
  return {
    status: 'resolved',
    provider: outcome.providerId,
    providerPlaceId: place.placeId,
    lat: place.latitude,
    lng: place.longitude,
    displayName,
    formattedAddress: (place.address ?? displayName).slice(0, PLACE_ADDRESS_MAX_LENGTH),
    resolvedAt,
    attribution: {
      providerLabel: outcome.attribution,
      ...(outcome.termsUrl ? { providerUrl: outcome.termsUrl } : {}),
    },
  };
}

async function reserveLookups(
  count: number,
  providerId: string,
  context: ItineraryExecutionContext,
): Promise<SearchAdmission[] | null> {
  const billing = context.billing;
  if (!billing) return Array.from({ length: count }, () => INCLUDED_SEARCH_ADMISSION);
  const admissions: SearchAdmission[] = [];
  for (let index = 0; index < count; index++) {
    const reserved = await reservePlacesSearchCharge(billing, {
      providerId,
      toolCallId: `${context.toolCallId}:${index}`,
    });
    if (reserved.outcome === 'refused') {
      await Promise.all(
        admissions.map((admission, admitted) =>
          settlePlacesSearchCall(billing, {
            admission,
            providerId,
            toolCallId: `${context.toolCallId}:${admitted}`,
            billableCalls: 0,
            answered: false,
          }),
        ),
      );
      return null;
    }
    admissions.push(reserved.admission);
  }
  return admissions;
}

async function searchLookup(
  lookup: Lookup,
  index: number,
  admission: SearchAdmission,
  provider: PlacesProvider,
  context: ItineraryExecutionContext,
): Promise<PlacesSearchOutcome> {
  const settle = (outcome: PlacesSearchOutcome | null): Promise<void> =>
    context.billing
      ? settlePlacesSearchCall(context.billing, {
          admission,
          providerId: outcome?.providerId ?? provider.id,
          toolCallId: `${context.toolCallId}:${index}`,
          billableCalls: outcome?.billableCalls ?? 0,
          answered: outcome?.ok === true,
        })
      : Promise.resolve();
  let outcome: PlacesSearchOutcome;
  try {
    outcome = await provider.search({
      query: lookup.query,
      ...(lookup.near ? { near: lookup.near } : {}),
      limit: 1,
      ...(context.signal ? { signal: context.signal } : {}),
    });
  } catch (error) {
    await settle(null);
    throw error;
  }
  await settle(outcome);
  return outcome;
}

function routeEndpoint(place: ResolvedPlace): { point: string; placeId: string | null } {
  return {
    point: `${place.lat},${place.lng}`,
    placeId: place.provider === GOOGLE_PLACES_PROVIDER_ID ? place.providerPlaceId : null,
  };
}

function directionsUrl(places: readonly ResolvedPlace[], travelMode: ItineraryTravelMode): string {
  const url = new URL(DIRECTIONS_URL);
  const [first, ...rest] = places.map(routeEndpoint);
  const last = rest.pop();
  url.searchParams.set('api', '1');
  if (first) {
    url.searchParams.set('origin', first.point);
    if (first.placeId) url.searchParams.set('origin_place_id', first.placeId);
  }
  if (last) {
    url.searchParams.set('destination', last.point);
    if (last.placeId) url.searchParams.set('destination_place_id', last.placeId);
  }
  if (rest.length > 0) {
    url.searchParams.set('waypoints', rest.map((endpoint) => endpoint.point).join('|'));
    if (rest.every((endpoint) => endpoint.placeId)) {
      url.searchParams.set(
        'waypoint_place_ids',
        rest.map((endpoint) => endpoint.placeId).join('|'),
      );
    }
  }
  url.searchParams.set('travelmode', travelMode);
  return url.toString();
}

function buildRoute(
  stops: readonly ItineraryStop[],
  places: readonly PlaceIdentity[],
  travelMode: ItineraryTravelMode,
): ItineraryRoute {
  const unresolvedStopCount = places.filter((place) => place.status === 'unresolved').length;
  if (stops.length < 2) {
    return { status: 'unavailable', reason: 'too_few_stops', unresolvedStopCount };
  }
  if (unresolvedStopCount > 0) {
    return { status: 'unavailable', reason: 'unresolved_stops', unresolvedStopCount };
  }
  const step = ITINERARY_STOPS_PER_ROUTE_LEG - 1;
  const legs: ItineraryStop[][] = [];
  for (let start = 0; start < stops.length - 1; start += step) {
    legs.push(stops.slice(start, Math.min(start + ITINERARY_STOPS_PER_ROUTE_LEG, stops.length)));
  }
  return {
    status: 'available',
    travelMode,
    legs: legs.map((leg) => ({
      label:
        legs.length === 1
          ? FULL_ROUTE_LABEL
          : `Stops ${leg[0]!.pin} to ${leg[leg.length - 1]!.pin}`,
      url: directionsUrl(
        leg.map((stop) => places[stop.placeIndex] as ResolvedPlace),
        travelMode,
      ),
      stopIds: leg.map((stop) => stop.id),
    })),
  };
}

function mostCommon(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | undefined;
  for (const [value, count] of counts) {
    if (best === undefined || count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

function placeLabel(place: PlaceIdentity | undefined): string {
  if (!place) return '';
  return place.status === 'resolved' ? place.displayName : place.query;
}

function isResolved(place: PlaceIdentity | undefined): place is ResolvedPlace {
  return place?.status === 'resolved';
}

function lookupFailed(place: PlaceIdentity | undefined): boolean {
  return (
    place?.status === 'unresolved' &&
    (place.reason === 'provider_error' || place.reason === 'rate_limited')
  );
}

function unresolvedNote(place: PlaceIdentity | undefined): string {
  return lookupFailed(place) ? 'could not be looked up' : 'not found on the map';
}

function fallbackText(body: ItineraryCardBody): string {
  return body.stops
    .map((stop) => {
      const place = body.places[stop.placeIndex];
      const time = stop.startTimeLabel ? ` (${stop.startTimeLabel})` : '';
      const missing = isResolved(place) ? '' : `, ${unresolvedNote(place)}`;
      return `${stop.pin}. ${placeLabel(place)}${time}${missing}`;
    })
    .join('\n');
}

function routeLine(route: ItineraryRoute): string {
  if (route.status === 'available') {
    return `The route opens in Google Maps by ${route.travelMode}, in ${route.legs.length} part(s).`;
  }
  if (route.reason === 'unresolved_stops') {
    return `No route was built: ${route.unresolvedStopCount} place(s) are missing from the map.`;
  }
  return 'No route was built: the plan has a single stop.';
}

function modelSummary(body: ItineraryCardBody): string {
  const lines = body.stops.map((stop) => {
    const place = body.places[stop.placeIndex];
    const time = stop.startTimeLabel ? `${stop.startTimeLabel}, ` : '';
    return isResolved(place)
      ? `${stop.pin}. ${time}${place.displayName}, ${place.formattedAddress}`
      : `${stop.pin}. ${time}${unresolvedNote(place)}: "${placeLabel(place)}"`;
  });
  const attribution = body.places.find(isResolved)?.attribution.providerLabel;
  return [
    `Rendered an itinerary card titled "${body.title}" above your reply, with each stop numbered on a map. The user can already see it.`,
    ...lines,
    routeLine(body.route),
    'Follow it with a short note on how the plan fits together and practical tips. Do not repeat the stop list, the addresses or the route links. Name any stop that was not found or could not be looked up, and suggest an alternative.',
    BOOKING_GUIDANCE,
    ...(attribution ? [`Attribution to show with these places: ${attribution}.`] : []),
  ].join('\n');
}

function buildCard(
  body: ItineraryCardBody,
  context: ItineraryExecutionContext,
  createdAt: string,
): InteractiveCard | null {
  for (const [attempt, noteBudget] of NOTE_BUDGETS.entries()) {
    const fitted: ItineraryCardBody = {
      ...body,
      summary: body.summary.slice(0, SUMMARY_BUDGETS[attempt]),
      stops: body.stops.map((stop) => ({ ...stop, note: stop.note.slice(0, noteBudget) })),
    };
    const rawCard = {
      schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
      cardId: context.toolCallId,
      kind: ITINERARY_CARD_KIND,
      createdAt,
      fallback: { headline: fitted.title, text: fallbackText(fitted) },
      producedBy: { toolCallId: context.toolCallId, toolName: ITINERARY_TOOL_NAME },
      body: fitted,
    };
    if (JSON.stringify(rawCard).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) continue;
    const card = parseInteractiveCardDelta({ card: rawCard });
    if (card?.recognized && card.kind === ITINERARY_CARD_KIND) return card;
  }
  return null;
}

export async function executeItineraryTool(
  args: Record<string, unknown>,
  context: ItineraryExecutionContext,
): Promise<ItineraryToolOutcome> {
  const parsed = ItineraryInputSchema.safeParse(args);
  if (!parsed.success) return { ok: false, content: INVALID_INPUT_MESSAGE };
  const input = parsed.data;

  const provider = context.provider ?? createGooglePlacesProvider();
  if (!provider.configured()) return { ok: false, content: UNAVAILABLE_MESSAGE };

  const lookups: Lookup[] = [];
  const lookupIndexByKey = new Map<string, number>();
  const lookupIndexByStop = input.stops.map((stop) => {
    const key = lookupKey(stop);
    const existing = lookupIndexByKey.get(key);
    if (existing !== undefined) return existing;
    lookupIndexByKey.set(key, lookups.length);
    return lookups.push({ query: stop.placeQuery, near: stop.localityHint }) - 1;
  });

  const admissions = await reserveLookups(lookups.length, provider.id, context);
  if (!admissions) return { ok: false, content: UNAFFORDABLE_MESSAGE, unaffordable: true };

  const outcomes = await Promise.all(
    lookups.map((lookup, index) =>
      searchLookup(lookup, index, admissions[index]!, provider, context),
    ),
  );
  const createdAt = (context.now ?? (() => new Date()))().toISOString();
  const identities = lookups.map((lookup, index) =>
    toIdentity(lookup, outcomes[index]!, createdAt),
  );
  if (identities.every(lookupFailed)) return { ok: false, content: LOOKUP_FAILED_MESSAGE };

  const places: PlaceIdentity[] = [];
  const placeIndexByKey = new Map<string, number>();
  const stops: ItineraryStop[] = input.stops.map((stop, index) => {
    const lookupIndex = lookupIndexByStop[index]!;
    const identity = identities[lookupIndex]!;
    const key =
      identity.status === 'resolved'
        ? `${identity.provider}:${identity.providerPlaceId}`
        : `lookup:${lookupIndex}`;
    let placeIndex = placeIndexByKey.get(key);
    if (placeIndex === undefined) {
      placeIndex = places.push(identity) - 1;
      placeIndexByKey.set(key, placeIndex);
    }
    return {
      id: `stop-${index + 1}`,
      pin: index + 1,
      placeIndex,
      startTimeLabel: stop.startTimeLabel,
      note: stop.note,
      sources: [],
    };
  });

  const timeZone =
    [input.region?.timeZone, context.timeZone].find(
      (candidate): candidate is string => !!candidate && isValidIanaTimeZone(candidate),
    ) ?? DEFAULT_TIME_ZONE;
  const body: ItineraryCardBody = {
    title: input.title,
    summary: input.summary,
    summarySources: [],
    region: {
      label:
        input.region?.label ||
        mostCommon(input.stops.map((stop) => stop.localityHint).filter(Boolean)) ||
        input.title,
      timeZone,
    },
    places,
    stops,
    route: buildRoute(stops, places, input.travelMode),
  };

  const card = buildCard(body, context, createdAt);
  if (!card) return { ok: false, content: TOO_LARGE_MESSAGE };
  return { ok: true, content: modelSummary(body), card };
}
