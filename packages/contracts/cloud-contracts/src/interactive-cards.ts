import { z } from 'zod';
import {
  CLARIFY_HEADER_MAX_LENGTH,
  CLARIFY_MAX_OPTIONS,
  CLARIFY_MAX_QUESTIONS,
  CLARIFY_MIN_OPTIONS,
  CLARIFY_OTHER_MAX_LENGTH,
  INTERACTIVE_CARDS_MAX_PER_MESSAGE,
  INTERACTIVE_CARDS_METADATA_KEY,
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  ITINERARY_MAX_STOPS,
  ITINERARY_NOTE_MAX_LENGTH,
  MAP_SEARCH_MAX_PLACES,
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  MAP_SEARCH_QUERY_MAX_LENGTH,
  PLACES_CARD_ADDRESS_MAX_LENGTH,
  PLACES_CARD_ATTRIBUTION_MAX_LENGTH,
  PLACES_CARD_CATEGORY_MAX_LENGTH,
  PLACES_CARD_LOCAL_TIME_MAX_LENGTH,
  PLACES_CARD_MAX_PHOTOS_PER_PLACE,
  PLACES_CARD_MAX_PLACES,
  PLACES_CARD_MAX_RATING,
  PLACES_CARD_MIN_RATING,
  PLACES_CARD_NAME_MAX_LENGTH,
  PLACES_CARD_PHOTO_REFERENCE_MAX_LENGTH,
  PLACES_CARD_PLACE_ID_MAX_LENGTH,
  PLACES_SEARCH_NEAR_MAX_LENGTH,
  PLACES_SEARCH_QUERY_MAX_LENGTH,
  PLACE_PRICE_LEVELS,
  isKnownInteractiveCardKind,
  type InteractiveCard,
  type MapSearchAction,
} from '@agiworkforce/types';

const HttpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), { message: 'https only' });

const IsoDate = z.string().datetime({ offset: true });

const FallbackSchema = z
  .object({
    headline: z.string().min(1).max(200),
    text: z.string().min(1).max(8_000),
    markdown: z.string().max(16_000).optional(),
  })
  .strict();

const InteractionSchema = z
  .object({
    runId: z.string().uuid(),
    awaitingResponse: z.boolean(),
    expiresAt: IsoDate,
    executionMode: z.literal('cloud_managed'),
  })
  .strict();

export const InteractiveCardEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive().max(9_999),
  cardId: z.string().min(1).max(128),
  kind: z.string().min(1).max(64),
  createdAt: IsoDate,
  fallback: FallbackSchema,
  interaction: InteractionSchema.optional(),
  producedBy: z
    .object({ toolCallId: z.string().min(1).max(128), toolName: z.string().min(1).max(200) })
    .strict(),
  body: z.unknown(),
});

const ClarifyOptionSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    description: z.string().max(200),
  })
  .strict();

const ClarifyQuestionSchema = z
  .object({
    id: z.string().min(1).max(64),
    header: z.string().min(1).max(CLARIFY_HEADER_MAX_LENGTH),
    question: z.string().min(1).max(300),
    options: z.array(ClarifyOptionSchema).min(CLARIFY_MIN_OPTIONS).max(CLARIFY_MAX_OPTIONS),
    multiSelect: z.boolean(),
    isOther: z.boolean(),
    isSecret: z.boolean(),
  })
  .strict();

export const ClarifyCardBodySchema = z
  .object({
    prompt: z.string().max(600).optional(),
    questions: z.array(ClarifyQuestionSchema).min(1).max(CLARIFY_MAX_QUESTIONS),
    state: z.discriminatedUnion('status', [
      z.object({ status: z.literal('pending') }).strict(),
      z
        .object({
          status: z.literal('answered'),
          answeredAt: IsoDate,
          answers: z
            .array(
              z.discriminatedUnion('kind', [
                z
                  .object({
                    questionId: z.string().min(1).max(64),
                    kind: z.literal('options'),
                    optionIds: z.array(z.string().min(1).max(64)).max(CLARIFY_MAX_OPTIONS),
                    labels: z.array(z.string().max(80)).max(CLARIFY_MAX_OPTIONS),
                  })
                  .strict(),
                z
                  .object({
                    questionId: z.string().min(1).max(64),
                    kind: z.literal('other'),
                    text: z.string().max(CLARIFY_OTHER_MAX_LENGTH),
                  })
                  .strict(),
                z
                  .object({ questionId: z.string().min(1).max(64), kind: z.literal('skipped') })
                  .strict(),
              ]),
            )
            .max(CLARIFY_MAX_QUESTIONS),
        })
        .strict(),
      z
        .object({
          status: z.literal('dismissed'),
          dismissedAt: IsoDate,
          freeText: z.string().max(2_000).optional(),
        })
        .strict(),
      z
        .object({
          status: z.literal('expired'),
          reason: z.enum(['checkpoint_gone', 'turn_failed', 'superseded']),
        })
        .strict(),
    ]),
  })
  .strict()
  /**
   * Every answer must name a question that exists, and every selected option
   * must exist on that question. Without this a resumed turn could re-render an
   * option the user never saw.
   */
  .superRefine((body, ctx) => {
    if (body.state.status !== 'answered') return;
    const byId = new Map(body.questions.map((question) => [question.id, question]));
    for (const answer of body.state.answers) {
      const question = byId.get(answer.questionId);
      if (!question) {
        ctx.addIssue({
          code: 'custom',
          path: ['state', 'answers'],
          message: `answer for unknown question ${answer.questionId}`,
        });
        continue;
      }
      if (answer.kind === 'other' && !question.isOther) {
        ctx.addIssue({
          code: 'custom',
          path: ['state', 'answers'],
          message: `free text on non-other question ${question.id}`,
        });
      }
      if (answer.kind === 'options') {
        if (!question.multiSelect && answer.optionIds.length > 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['state', 'answers'],
            message: `multiple answers to single-select ${question.id}`,
          });
        }
        const known = new Set(question.options.map((option) => option.id));
        for (const selected of answer.optionIds) {
          if (!known.has(selected)) {
            ctx.addIssue({
              code: 'custom',
              path: ['state', 'answers'],
              message: `unknown option ${selected} on ${question.id}`,
            });
          }
        }
      }
    }
  });

export const PlaceIdentitySchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('resolved'),
      provider: z.string().min(1).max(64),
      providerPlaceId: z.string().min(1).max(512),
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
      displayName: z.string().min(1).max(200),
      formattedAddress: z.string().min(1).max(500),
      resolvedAt: IsoDate,
      attribution: z
        .object({
          providerLabel: z.string().min(1).max(80),
          providerUrl: HttpsUrlSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      status: z.literal('unresolved'),
      query: z.string().min(1).max(300),
      reason: z.enum([
        'no_match',
        'ambiguous',
        'outside_region',
        'provider_error',
        'rate_limited',
        'not_permitted_in_this_chat',
      ]),
    })
    .strict(),
]);

const MediaRefSchema = z
  .object({
    fileId: z.string().min(1).max(128),
    width: z.number().int().positive().max(4_096),
    height: z.number().int().positive().max(4_096),
    alt: z.string().max(300),
  })
  .strict();

const SourceSchema = z.object({ url: HttpsUrlSchema, title: z.string().min(1).max(120) }).strict();

export const ItineraryCardBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    summary: z.string().max(2_000),
    summarySources: z.array(SourceSchema).max(16),
    region: z
      .object({ label: z.string().min(1).max(200), timeZone: z.string().min(1).max(64) })
      .strict(),
    places: z.array(PlaceIdentitySchema).min(1).max(ITINERARY_MAX_STOPS),
    stops: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            pin: z.number().int().positive().max(ITINERARY_MAX_STOPS),
            placeIndex: z.number().int().gte(0).lt(ITINERARY_MAX_STOPS),
            startTimeLabel: z.string().max(24),
            note: z.string().max(ITINERARY_NOTE_MAX_LENGTH),
            thumbnail: MediaRefSchema.optional(),
            sources: z.array(SourceSchema).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(ITINERARY_MAX_STOPS),
    route: z.discriminatedUnion('status', [
      z
        .object({
          status: z.literal('available'),
          travelMode: z.enum(['driving', 'walking', 'bicycling', 'transit']),
          legs: z
            .array(
              z
                .object({
                  label: z.string().min(1).max(120),
                  url: HttpsUrlSchema.max(4_096),
                  stopIds: z.array(z.string().min(1).max(64)).min(2),
                })
                .strict(),
            )
            .min(1)
            .max(8),
        })
        .strict(),
      z
        .object({
          status: z.literal('unavailable'),
          reason: z.enum([
            'unresolved_stops',
            'too_few_stops',
            'provider_unavailable',
            'not_permitted_in_this_chat',
          ]),
          unresolvedStopCount: z.number().int().gte(0).max(ITINERARY_MAX_STOPS),
        })
        .strict(),
    ]),
    overview: MediaRefSchema.optional(),
  })
  .strict()
  /**
   * THE INVARIANTS THAT WOULD HAVE PREVENTED THE WRONG-CITY LINK. Enforced at
   * the untrusted boundary, on every surface, independently of any UI code. The
   * type makes the wrong RENDER impossible; this makes the wrong PAYLOAD
   * impossible, so a producer bug fails validation instead of shipping.
   */
  .superRefine((body, ctx) => {
    for (const stop of body.stops) {
      if (stop.placeIndex >= body.places.length) {
        ctx.addIssue({ code: 'custom', path: ['stops'], message: 'placeIndex out of range' });
      }
    }
    const unresolved = body.places.filter((place) => place.status === 'unresolved').length;
    if (body.route.status === 'available' && unresolved > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['route'],
        message: `route marked available with ${unresolved} unresolved place(s)`,
      });
    }
    if (
      body.route.status === 'unavailable' &&
      body.route.reason === 'unresolved_stops' &&
      body.route.unresolvedStopCount !== unresolved
    ) {
      ctx.addIssue({ code: 'custom', path: ['route'], message: 'unresolved count mismatch' });
    }
  });

const MapSearchActionSchema = z
  .object({
    provider: z.enum(['google_maps', 'openstreetmap']),
    label: z.string().min(1).max(80),
    url: HttpsUrlSchema,
  })
  .strict();

export function isAllowedMapSearchProviderUrl(
  value: string,
  provider?: MapSearchAction['provider'],
): boolean {
  try {
    const url = new URL(value);
    const google =
      (!provider || provider === 'google_maps') &&
      url.origin === 'https://www.google.com' &&
      url.pathname === '/maps/search/' &&
      url.searchParams.get('api') === '1' &&
      Boolean(url.searchParams.get('query'));
    const openStreetMap =
      (!provider || provider === 'openstreetmap') &&
      url.origin === 'https://www.openstreetmap.org' &&
      url.pathname === '/search' &&
      Boolean(url.searchParams.get('query'));
    return google || openStreetMap;
  } catch {
    return false;
  }
}

const LatitudeSchema = z.number().finite().min(-85.05112878).max(85.05112878);
const LongitudeSchema = z.number().finite().min(-180).max(180);

const MapSearchPlaceSchema = z
  .object({
    label: z.string().min(1).max(160),
    latitude: LatitudeSchema,
    longitude: LongitudeSchema,
    kind: z.string().min(1).max(40).optional(),
    confident: z.boolean().optional(),
  })
  .strict();

const MapSearchViewSchema = z
  .object({
    latitude: LatitudeSchema,
    longitude: LongitudeSchema,
    zoom: z.number().int().min(MAP_SEARCH_MIN_ZOOM).max(MAP_SEARCH_MAX_ZOOM),
    attribution: z.string().min(1).max(160),
  })
  .strict();

export const MapSearchCardBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    query: z.string().min(1).max(MAP_SEARCH_QUERY_MAX_LENGTH),
    actions: z.array(MapSearchActionSchema).min(1).max(2),
    view: MapSearchViewSchema.optional(),
    places: z.array(MapSearchPlaceSchema).max(MAP_SEARCH_MAX_PLACES).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (!body.view && body.places && body.places.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['places'], message: 'places require a view' });
    }
    if (new Set(body.actions.map((action) => action.provider)).size !== body.actions.length) {
      ctx.addIssue({ code: 'custom', path: ['actions'], message: 'duplicate map provider' });
    }
    for (const [index, action] of body.actions.entries()) {
      if (!isAllowedMapSearchProviderUrl(action.url, action.provider)) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions', index, 'url'],
          message: 'map provider URL mismatch',
        });
      }
    }
  });

const PlacesCardPhotoSchema = z
  .object({
    reference: z.string().min(1).max(PLACES_CARD_PHOTO_REFERENCE_MAX_LENGTH),
    attribution: z.string().min(1).max(PLACES_CARD_ATTRIBUTION_MAX_LENGTH).optional(),
  })
  .strict();

const PlacesCardPlaceSchema = z
  .object({
    placeId: z.string().min(1).max(PLACES_CARD_PLACE_ID_MAX_LENGTH),
    name: z.string().min(1).max(PLACES_CARD_NAME_MAX_LENGTH),
    latitude: LatitudeSchema,
    longitude: LongitudeSchema,
    address: z.string().min(1).max(PLACES_CARD_ADDRESS_MAX_LENGTH).optional(),
    rating: z.number().finite().min(PLACES_CARD_MIN_RATING).max(PLACES_CARD_MAX_RATING).optional(),
    reviewCount: z.number().int().nonnegative().optional(),
    category: z.string().min(1).max(PLACES_CARD_CATEGORY_MAX_LENGTH).optional(),
    priceLevel: z.enum(PLACE_PRICE_LEVELS).optional(),
    openNow: z.boolean().optional(),
    directionsUrl: HttpsUrlSchema.optional(),
    websiteUrl: HttpsUrlSchema.optional(),
    photos: z.array(PlacesCardPhotoSchema).max(PLACES_CARD_MAX_PHOTOS_PER_PLACE).optional(),
  })
  .strict();

export const PlacesCardBodySchema = z
  .object({
    query: z.string().min(1).max(PLACES_SEARCH_QUERY_MAX_LENGTH),
    near: z.string().min(1).max(PLACES_SEARCH_NEAR_MAX_LENGTH).optional(),
    openNowRequested: z.boolean(),
    localTime: z.string().min(1).max(PLACES_CARD_LOCAL_TIME_MAX_LENGTH).optional(),
    attribution: z.string().min(1).max(PLACES_CARD_ATTRIBUTION_MAX_LENGTH),
    termsUrl: HttpsUrlSchema.optional(),
    places: z.array(PlacesCardPlaceSchema).max(PLACES_CARD_MAX_PLACES),
  })
  .strict();

export const McpAppCardBodySchema = z
  .object({
    payloadId: z.string().uuid(),
    connectorId: z.string().min(1).max(200),
    toolName: z.string().min(1).max(128),
    resourceUri: z
      .string()
      .min(1)
      .max(4_096)
      .refine((value) => value.startsWith('ui://')),
  })
  .strict();

export function parseInteractiveCardDelta(payload: unknown): InteractiveCard | null {
  const envelope = InteractiveCardEnvelopeSchema.safeParse(
    (payload as { card?: unknown } | null | undefined)?.card,
  );
  if (!envelope.success) return null;
  if (JSON.stringify(envelope.data).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) return null;

  const { kind, body: rawBody, ...common } = envelope.data;

  if (envelope.data.schemaVersion > INTERACTIVE_CARD_SCHEMA_VERSION) {
    return { ...common, recognized: false, kind };
  }
  if (!isKnownInteractiveCardKind(kind)) return { ...common, recognized: false, kind };

  const parsed =
    kind === 'clarify.v1'
      ? ClarifyCardBodySchema.safeParse(rawBody)
      : kind === 'itinerary.v1'
        ? ItineraryCardBodySchema.safeParse(rawBody)
        : kind === 'map-search.v1'
          ? MapSearchCardBodySchema.safeParse(rawBody)
          : kind === 'places.v1'
            ? PlacesCardBodySchema.safeParse(rawBody)
            : McpAppCardBodySchema.safeParse(rawBody);
  if (!parsed.success) return { ...common, recognized: false, kind };

  return { ...common, recognized: true, kind, body: parsed.data } as InteractiveCard;
}

export function readPersistedInteractiveCards(metadata: unknown): InteractiveCard[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>)[INTERACTIVE_CARDS_METADATA_KEY];
  if (!Array.isArray(raw)) return [];
  const cards: InteractiveCard[] = [];
  for (const entry of raw.slice(0, INTERACTIVE_CARDS_MAX_PER_MESSAGE)) {
    const card = parseInteractiveCardDelta({ card: entry });
    if (card) cards.push(card);
  }
  return cards;
}
